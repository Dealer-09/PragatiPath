let chatBubble = document.getElementById("chat-bubble");
let chatContainer = document.getElementById("chat-container");
let chatWrapper = document.getElementById("chat-wrapper");
let btn = document.getElementById("btn");
let messageInput = document.getElementById("message-input");

// Toggle Chat Window
chatBubble.addEventListener("click", function () {
    chatWrapper.style.display = chatWrapper.style.display === "none" ? "flex" : "none";
});

async function sendChatMessage() {
    const query = messageInput.value.trim();
    if (!query) return;

    const userDiv = document.createElement("div");
    userDiv.classList.add("user-message");
    userDiv.innerHTML = query;
    chatContainer.appendChild(userDiv);
    messageInput.value = "";

    const botDiv = document.createElement("div");
    botDiv.classList.add("bot-message");
    botDiv.innerHTML = "Thinking...";
    chatContainer.appendChild(botDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;

    try {
        const res = await fetch(window.location.origin + "/api/gemini/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query })
        });
        const data = await res.json();
        botDiv.innerHTML = typeof marked !== "undefined"
            ? marked.parse(data.response || data.error || "Error")
            : (data.response || data.error || "Error");
    } catch (err) {
        botDiv.innerHTML = "Failed to connect. Please try again.";
    }

    chatContainer.scrollTop = chatContainer.scrollHeight;
}

btn.addEventListener("click", sendChatMessage);
messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendChatMessage();
});