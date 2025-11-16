// ================================
//  Internationalization (i18n) System
// ================================

// Supported languages
const SUPPORTED_LANGUAGES = {
  en: 'English',
  da: 'Dansk',
  sv: 'Svenska',
  de: 'Deutsch',
  it: 'Italiano',
  es: 'Español',
  fr: 'Français',
  nl: 'Nederlands',
};

// Default language
const DEFAULT_LANGUAGE = 'en';

// Current language
let currentLanguage = DEFAULT_LANGUAGE;

// Translation data
const translations = {};

// Load translation for a language
async function loadTranslations(lang) {
  if (translations[lang]) {
    return translations[lang];
  }

  try {
    const response = await fetch(`/translations/${lang}.json`);
    if (!response.ok) {
      throw new Error(`Failed to load translations for ${lang}`);
    }
    translations[lang] = await response.json();
    return translations[lang];
  } catch (error) {
    console.error(`Error loading translations for ${lang}:`, error);
    // Fallback to English if available
    if (lang !== DEFAULT_LANGUAGE && translations[DEFAULT_LANGUAGE]) {
      return translations[DEFAULT_LANGUAGE];
    }
    return {};
  }
}

// Get translation for a key
function t(key, params = {}) {
  const langTranslations = translations[currentLanguage] || {};
  let text = langTranslations[key] || key;

  // Replace parameters in the format {{param}}
  Object.keys(params).forEach(param => {
    text = text.replace(new RegExp(`{{${param}}}`, 'g'), params[param]);
  });

  return text;
}

// Detect user's preferred language
function detectLanguage() {
  // 1. Check URL parameter
  const urlParams = new URLSearchParams(window.location.search);
  const urlLang = urlParams.get('lang');
  if (urlLang && SUPPORTED_LANGUAGES[urlLang]) {
    return urlLang;
  }

  // 2. Check localStorage
  const storedLang = localStorage.getItem('preferredLanguage');
  if (storedLang && SUPPORTED_LANGUAGES[storedLang]) {
    return storedLang;
  }

  // 3. Check browser language
  const browserLang = navigator.language || navigator.userLanguage;
  const langCode = browserLang.split('-')[0].toLowerCase();
  if (SUPPORTED_LANGUAGES[langCode]) {
    return langCode;
  }

  // 4. Default to English
  return DEFAULT_LANGUAGE;
}

// Set language
async function setLanguage(lang) {
  if (!SUPPORTED_LANGUAGES[lang]) {
    console.warn(`Language ${lang} is not supported`);
    return;
  }

  currentLanguage = lang;
  localStorage.setItem('preferredLanguage', lang);

  // Load translations if not already loaded
  await loadTranslations(lang);

  // Update all translated elements
  updateTranslations();

  // Update URL without reload
  const url = new URL(window.location);
  url.searchParams.set('lang', lang);
  window.history.replaceState({}, '', url);
}

// Update all translated elements on the page
function updateTranslations() {
  // Update elements with data-i18n attribute
  document.querySelectorAll('[data-i18n]').forEach(element => {
    const key = element.getAttribute('data-i18n');
    const translation = t(key);
    
    if (element.tagName === 'INPUT' && element.type !== 'submit' && element.type !== 'button') {
      element.placeholder = translation;
    } else if (element.tagName === 'INPUT' && (element.type === 'submit' || element.type === 'button')) {
      element.value = translation;
    } else {
      element.textContent = translation;
    }
  });

  // Update elements with data-i18n-html attribute (for HTML content)
  document.querySelectorAll('[data-i18n-html]').forEach(element => {
    const key = element.getAttribute('data-i18n-html');
    element.innerHTML = t(key);
  });

  // Update title
  const titleKey = document.querySelector('title')?.getAttribute('data-i18n');
  if (titleKey) {
    document.title = t(titleKey);
  }

  // Update meta description if present
  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) {
    const descKey = metaDesc.getAttribute('data-i18n');
    if (descKey) {
      metaDesc.content = t(descKey);
    }
  }
}

// Initialize i18n
async function initI18n() {
  const lang = detectLanguage();
  await setLanguage(lang);
}

// Export for use in other scripts
window.i18n = {
  t,
  setLanguage,
  getCurrentLanguage: () => currentLanguage,
  getSupportedLanguages: () => SUPPORTED_LANGUAGES,
  init: initI18n,
};

