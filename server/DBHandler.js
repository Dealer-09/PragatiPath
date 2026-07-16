const mongoose = require('mongoose');
const clerk = require('@clerk/express');

// Track users already accounted for this server session (replaces cookie-session)
const _accountedFor = new Set();

async function connectDB(URI) {
    try {
        await mongoose.connect(URI);
        console.log('[DB] Connected to MongoDB');
    } catch (err) {
        console.error('[DB] FATAL: MongoDB connection failed:', err.message);
        process.exit(1); // crash fast — don't serve traffic without a DB
    }
}

const userSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    fullName: { type: String, required: false, default: '' },
    enrolledCourses: {
        type: [{
            name: { type: String, required: true },
            progress: { type: Number, required: true, default: 0 }
        }], default: []
    },
    completedCourses: { type: [String], default: [] }
});

const Users = mongoose.model('users', userSchema);

async function middleware_userAuth(req, res, next) {
    if (!_accountedFor.has(req.auth.userId)) {
        _accountedFor.add(req.auth.userId);
        try {
            const existing = await Users.findOne({ userId: req.auth.userId });
            if (existing === null) {
                const userData = await clerk.clerkClient.users.getUser(req.auth.userId);
                // Social login users may have no username — fall back to firstName or userId
                const username = userData.username
                    || userData.firstName
                    || `user_${req.auth.userId.slice(-6)}`;
                const userStore = new Users({
                    userId: req.auth.userId,
                    name: username,
                    fullName: `${userData.firstName || ''} ${userData.lastName || ''}`.trim(),
                    enrolledCourses: [],
                    completedCourses: []
                });
                await userStore.save();
            }
        } catch (error) {
            console.error("[UserDB] middleware_userAuth failed:", error.message);
            // Still call next() — auth passed, DB error shouldn't block the page
        }
    }
    next();
}

async function endpoint_userInfo(req, res) {
    try {
        const userDbStore = await Users.findOne(
            { userId: req.auth.userId },
            { _id: 0, __v: 0, userId: 0 }
        );
        if (!userDbStore) return res.status(404).json({ error: "User not found" });

        const uinfo = await clerk.clerkClient.users.getUser(req.auth.userId);
        res.json({
            name: userDbStore.name,
            fullName: userDbStore.fullName,
            enrolledCourses: userDbStore.enrolledCourses,
            completedCourses: userDbStore.completedCourses,
            imgUrl: uinfo.imageUrl
        });
    } catch (error) {
        console.error("[UserDB] endpoint_userInfo failed:", error.message);
        res.status(500).json({ error: "Internal server error" });
    }
}

async function endpoint_addCourse(req, res) {
    try {
        const { courseName } = req.body;
        if (!courseName) return res.status(400).json({ error: "Course name is required" });

        // Check if already enrolled (avoid duplicates — $addToSet only works for primitives)
        const existing = await Users.findOne({
            userId: req.auth.userId,
            'enrolledCourses.name': courseName
        });
        if (existing) return res.json({ alreadyEnrolled: true });

        const userDbStore = await Users.findOneAndUpdate(
            { userId: req.auth.userId },
            { $push: { enrolledCourses: { name: courseName, progress: 0 } } },
            { new: true }
        );
        if (!userDbStore) return res.status(404).json({ error: "User not found" });
        res.json(userDbStore);
    } catch (error) {
        console.error("[UserDB] endpoint_addCourse failed:", error.message);
        res.status(500).json({ error: "Internal server error" });
    }
}

async function endpoint_removeCourse(req, res) {
    try {
        const { courseName } = req.body;
        if (!courseName) return res.status(400).json({ error: "Course name is required" });

        const userDbStore = await Users.findOneAndUpdate(
            { userId: req.auth.userId },
            { $pull: { enrolledCourses: { name: courseName } } },
            { new: true }
        );
        if (!userDbStore) return res.status(404).json({ error: "User not found" });
        res.json(userDbStore);
    } catch (error) {
        console.error("[UserDB] endpoint_removeCourse failed:", error.message);
        res.status(500).json({ error: "Internal server error" });
    }
}

async function endpoint_updateCourseProgress(req, res) {
    try {
        const { courseName, progress } = req.body;
        if (!courseName || progress === undefined) {
            return res.status(400).json({ error: "Course name and progress are required" });
        }

        const delta = Math.max(0, Math.min(100, Number(progress)));
        if (isNaN(delta)) return res.status(400).json({ error: "Invalid progress value" });

        // ── Step 1: atomically increment progress on the matching subdocument ──
        // $inc avoids loading the full document and re-validating ALL subdocuments
        // (which fails when other enrolledCourse entries have bad/missing name fields).
        const updated = await Users.findOneAndUpdate(
            { userId: req.auth.userId, 'enrolledCourses.name': courseName },
            { $inc: { 'enrolledCourses.$.progress': delta } },
            { new: true, runValidators: false }
        );

        if (!updated) {
            // Course not found in enrolledCourses — could already be completed or not enrolled
            return res.status(404).json({ error: "Course not found in enrolled courses" });
        }

        // ── Step 2: if progress reached 100, move to completedCourses ──────────
        const course = updated.enrolledCourses.find(c => c.name === courseName);
        if (course && course.progress >= 100) {
            await Users.findOneAndUpdate(
                { userId: req.auth.userId },
                {
                    $pull:     { enrolledCourses:   { name: courseName } },
                    $addToSet: { completedCourses: courseName }
                },
                { runValidators: false }
            );
        }

        res.json({ ok: true, progress: course?.progress ?? delta });
    } catch (error) {
        console.error("[UserDB] endpoint_updateCourseProgress failed:", error.message);
        res.status(500).json({ error: "Internal server error" });
    }
}

const courseSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    description: { type: String, required: true },
    playlist: { type: String, required: true },
    medium: { type: String, default: "Hindi" }
});

const Courses = mongoose.model('courses', courseSchema);

async function endpoint_getCourseList(req, res) {
    try {
        const courses = await Courses.find({}, { __v: 0 });
        res.json(courses);
    } catch (error) {
        console.error("[CourseDB] endpoint_getCourseList failed:", error.message);
        res.status(500).json({ error: "Internal server error" });
    }
}

async function endpoint_getCourseByName(req, res) {
    try {
        const { courseName } = req.params;
        if (!courseName) return res.status(400).json({ error: "Course name is required" });

        const course = await Courses.findOne({ name: courseName }, { _id: 0, __v: 0 });
        if (!course) return res.status(404).json({ error: "Course not found" });
        res.json(course);
    } catch (error) {
        console.error("[CourseDB] endpoint_getCourseByName failed:", error.message);
        res.status(500).json({ error: "Internal server error" });
    }
}

async function endpoint_getCourseById(req, res) {
    try {
        const { courseId } = req.params;
        if (!courseId) return res.status(400).json({ error: "Course ID is required" });

        // Validate ObjectId format before querying to avoid CastError
        if (!mongoose.Types.ObjectId.isValid(courseId)) {
            return res.status(400).json({ error: "Invalid course ID format" });
        }

        const course = await Courses.findOne({ _id: courseId }, { _id: 0, __v: 0 });
        if (!course) return res.status(404).json({ error: "Course not found" });
        res.json(course);
    } catch (error) {
        console.error("[CourseDB] endpoint_getCourseById failed:", error.message);
        res.status(500).json({ error: "Internal server error" });
    }
}

module.exports = { 
    connectDB, 
    Users, Courses,
    middleware_userAuth, endpoint_userInfo, endpoint_addCourse, endpoint_removeCourse, endpoint_updateCourseProgress,
    endpoint_getCourseList, endpoint_getCourseByName, endpoint_getCourseById
};