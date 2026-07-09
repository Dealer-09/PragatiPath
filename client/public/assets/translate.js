function googleTranslateElementInit() {
    new google.translate.TranslateElement({
      pageLanguage: 'en',
      autoDisplay: false
    }, 'google_translate_element');
  }
  
  function autoTranslate() {
    const lang = navigator.language || navigator.userLanguage;
    let targetLang = '';
  
    if (lang.startsWith('hi')) {
      targetLang = 'hi';
    } else if (lang.startsWith('bn')) {
      targetLang = 'bn';
    } else if (lang.startsWith('ta')) {
      targetLang = 'ta';
    } else if (lang.startsWith('te')) {
      targetLang = 'te';
    } else if (lang.startsWith('mr')) {
      targetLang = 'mr';
    }
  
    if (targetLang !== '') {
      const interval = setInterval(() => {
        if (document.querySelector('.goog-te-combo')) {
          document.querySelector('.goog-te-combo').value = targetLang;
          document.querySelector('.goog-te-combo').dispatchEvent(new Event('change'));
          clearInterval(interval);
        }
      }, 500);
    }
  }
  
  window.onload = autoTranslate;