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
  if (!key) return '';
  
  const langTranslations = translations[currentLanguage] || {};
  let text = langTranslations[key];
  
  // If translation not found, try English as fallback
  if (!text && currentLanguage !== DEFAULT_LANGUAGE) {
    const enTranslations = translations[DEFAULT_LANGUAGE] || {};
    text = enTranslations[key];
  }
  
  // If still not found, return the key (for debugging)
  if (!text) {
    console.warn(`Translation missing for key: ${key} (language: ${currentLanguage})`);
    return key;
  }

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
  
  // Also ensure default language (English) is loaded for fallback
  if (lang !== DEFAULT_LANGUAGE) {
    await loadTranslations(DEFAULT_LANGUAGE);
  }

  // Update all translated elements
  updateTranslations();

  // Update URL without reload
  const url = new URL(window.location);
  url.searchParams.set('lang', lang);
  window.history.replaceState({}, '', url);
}

// Update all translated elements on the page
function updateTranslations() {
  // Update elements with data-i18n attribute (including hidden elements)
  document.querySelectorAll('[data-i18n]').forEach(element => {
    const key = element.getAttribute('data-i18n');
    const translation = t(key);
    
    // Skip if translation is the same as the key (translation not found)
    if (translation === key && !key.startsWith('homepage.') && !key.startsWith('auth.')) {
      return;
    }
    
    if (element.tagName === 'INPUT' && element.type !== 'submit' && element.type !== 'button') {
      element.placeholder = translation;
    } else if (element.tagName === 'INPUT' && (element.type === 'submit' || element.type === 'button')) {
      element.value = translation;
    } else if (element.tagName === 'BUTTON') {
      element.textContent = translation;
    } else if (element.tagName === 'LABEL') {
      // For labels, update text but preserve structure (like tooltips and optional spans)
      const tooltip = element.querySelector('.tooltip');
      const optionalSpan = element.querySelector('span.optional');
      
      if (tooltip || optionalSpan) {
        // Preserve child elements, just update the text content
        // Find the first text node and update it, or insert text before the first child element
        const firstChild = element.firstChild;
        if (firstChild && firstChild.nodeType === 3) {
          // First child is a text node, update it
          firstChild.textContent = translation + (optionalSpan ? ' ' : '');
        } else {
          // No text node, insert one at the beginning
          const textNode = document.createTextNode(translation + (optionalSpan ? ' ' : ''));
          element.insertBefore(textNode, element.firstChild);
        }
      } else {
        // Simple label - just replace all text content
        element.textContent = translation;
      }
    } else if (element.tagName === 'OPTION') {
      element.textContent = translation;
    } else if (element.tagName === 'H1' || element.tagName === 'H2' || element.tagName === 'H3' || element.tagName === 'H4' || element.tagName === 'H5' || element.tagName === 'H6') {
      element.textContent = translation;
    } else if (element.tagName === 'P' || element.tagName === 'DIV' || element.tagName === 'SPAN') {
      // For div/span/p, check if it has only text content or has children with data-i18n
      const hasI18nChildren = element.querySelector('[data-i18n]');
      if (!hasI18nChildren) {
        // No children with translations, safe to replace text content
        element.textContent = translation;
      }
    } else {
      // Default: replace text content
      element.textContent = translation;
    }
  });

  // Update elements with data-i18n-html attribute (for HTML content)
  document.querySelectorAll('[data-i18n-html]').forEach(element => {
    const key = element.getAttribute('data-i18n-html');
    element.innerHTML = t(key);
  });

  // Update select options - check for data-i18n first, then use pattern matching
  document.querySelectorAll('select').forEach(select => {
    Array.from(select.options).forEach(option => {
      // First check if option has data-i18n attribute
      const dataI18nKey = option.getAttribute('data-i18n');
      if (dataI18nKey) {
        option.textContent = t(dataI18nKey);
      } else if (option.value) {
        // Fall back to pattern-based translation
        const optionKey = `option.${select.id}.${option.value}`;
        const translation = t(optionKey);
        if (translation !== optionKey) {
          option.textContent = translation;
        }
      }
    });
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
  updateTranslations,
};

