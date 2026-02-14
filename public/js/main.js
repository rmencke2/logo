      
      // CRITICAL FIX: Ensure modals are direct children of body, not inside any hidden containers
      (function() {
        const modals = ['loginModal', 'signupModal', 'forgotPasswordModal'];
        modals.forEach(modalId => {
          const modal = document.getElementById(modalId);
          if (modal && modal.parentElement && modal.parentElement.id === 'logoGenerator') {
            console.warn(`⚠️ Modal ${modalId} is inside logoGenerator! Moving to body...`);
            document.body.appendChild(modal);
          }
        });
      })();
      
      // Define global functions IMMEDIATELY so they're available for onclick handlers
      window.openLoginModal = function() {
        const modal = document.getElementById('loginModal');
        if (!modal) {
          console.error('❌ Login modal not found');
          return;
        }
        modal.classList.add('active');
        const errorDiv = document.getElementById('loginError');
        if (errorDiv) errorDiv.innerHTML = '';
        if (typeof window.closeAuthGate === 'function') {
          window.closeAuthGate();
        }
      };

      window.closeLoginModal = function() {
        const modal = document.getElementById('loginModal');
        if (modal) {
          modal.classList.remove('active');
          const form = document.getElementById('loginForm');
          if (form) form.reset();
        }
      };

      window.openSignupModal = function() {
        const modal = document.getElementById('signupModal');
        if (!modal) {
          console.error('❌ Signup modal not found');
          return;
        }
        modal.classList.add('active');
        const errorDiv = document.getElementById('signupError');
        if (errorDiv) errorDiv.innerHTML = '';
        if (typeof window.closeAuthGate === 'function') {
          window.closeAuthGate();
        }
      };

      window.closeSignupModal = function() {
        const modal = document.getElementById('signupModal');
        if (modal) {
          modal.classList.remove('active');
          const form = document.getElementById('signupForm');
          if (form) form.reset();
        }
      };

      window.showAuthGate = function() {
        const authGate = document.getElementById('authGate');
        if (authGate) {
          authGate.classList.add('active');
        } else {
          console.error('❌ Auth gate not found');
        }
      };

      window.closeAuthGate = function() {
        const authGate = document.getElementById('authGate');
        if (authGate) {
          authGate.classList.remove('active');
        }
      };

      window.openForgotPasswordModal = function() {
        const modal = document.getElementById('forgotPasswordModal');
        if (modal) {
          modal.classList.add('active');
          const errorDiv = document.getElementById('forgotPasswordError');
          if (errorDiv) errorDiv.innerHTML = '';
        }
      };

      window.closeForgotPasswordModal = function() {
        const modal = document.getElementById('forgotPasswordModal');
        if (modal) {
          modal.classList.remove('active');
          const form = document.getElementById('forgotPasswordForm');
          if (form) form.reset();
        }
      };
      
      const nameInput = document.getElementById('name');
      const taglineInput = document.getElementById('tagline');
      const locationInput = document.getElementById('location');
      const businessTypeSelect = document.getElementById('businessType');
      const suggestBtn = document.getElementById('suggestBtn');
      const suggestTaglineBtn = document.getElementById('suggestTaglineBtn');
      const suggestionsDiv = document.getElementById('suggestions');
      const taglineSuggestionsDiv = document.getElementById('taglineSuggestions');
      const createPlaybookBtn = document.getElementById('createPlaybookBtn');
      const styleSelect = document.getElementById('style');
      const fontCategorySelect = document.getElementById('fontCategory');
      const iconInput = document.getElementById('icon');
      const iconPickerBtn = document.getElementById('iconPickerBtn');
      const iconPickerModal = document.getElementById('iconPickerModal');
      const layoutSelect = document.getElementById('layout');
      const shapeSelect = document.getElementById('shape');
      const colorPaletteSelect = document.getElementById('colorPalette');
      const fontColorInp = document.getElementById('fontColor');
      const bgColorInp = document.getElementById('bgColor');
      const colorPickersDiv = document.getElementById('colorPickers');
      const btn = document.getElementById('generateBtn');
      const previewDiv = document.getElementById('preview');

      // Business name suggestions by type
      const businessNameSuggestions = {
        bakery: ['Sweet Dreams Bakery', 'Golden Crust', 'Artisan Loaf', 'Sugar & Spice', 'The Daily Bread', 'Flour Power', 'Crust & Crumb', 'Baked Bliss'],
        hairdresser: ['Shear Elegance', 'Cut & Style', 'The Hair Studio', 'Locks & Layers', 'Style & Shine', 'Hair Haven', 'Chic Cuts', 'The Salon'],
        plumber: ['Flow Masters', 'Pipe Pros', 'Aqua Fix', 'Drip Stop', 'Plumb Perfect', 'Water Works', 'Reliable Pipes', 'Fix It Fast'],
        electrician: ['Bright Sparks', 'Current Solutions', 'Power Up', 'Wired Right', 'Electric Experts', 'Volt Pro', 'Circuit Masters', 'Shock Free'],
        restaurant: ['The Corner Bistro', 'Flavor Fusion', 'Table & Taste', 'The Local Kitchen', 'Savory & Sweet', 'Dine & Delight', 'Culinary Craft', 'The Foodie'],
        fitness: ['Fit Zone', 'Strength Studio', 'Power Gym', 'Active Life', 'Fit Force', 'Body Works', 'Muscle Up', 'The Fitness Hub'],
        photography: ['Frame & Focus', 'Capture Moments', 'Lens & Light', 'Photo Art', 'Shutter Studio', 'Picture Perfect', 'Visual Story', 'The Lens'],
        consulting: ['Strategic Edge', 'Business Boost', 'Consult Pro', 'Smart Solutions', 'Expert Advice', 'Growth Partners', 'The Advisor', 'Insight Consulting'],
        retail: ['The Shop', 'Retail Realm', 'Market Place', 'Store & More', 'The Boutique', 'Retail Rendezvous', 'Shop Smart', 'The Storefront'],
        cleaning: ['Sparkle Clean', 'Spotless Service', 'Clean & Shine', 'Fresh Start', 'Tidy Team', 'Pure Clean', 'Shine Bright', 'The Cleaners'],
        landscaping: ['Green Thumb', 'Garden Masters', 'Lawn & Order', 'Nature\'s Best', 'Garden Design', 'Landscape Pro', 'Outdoor Art', 'The Gardeners'],
        automotive: ['Auto Care', 'Drive Right', 'Car Care Pro', 'Motor Masters', 'Auto Fix', 'Wheel Works', 'Garage Pro', 'The Mechanic'],
        'real-estate': ['Home Finders', 'Property Pro', 'Real Estate Plus', 'Home Base', 'Property Partners', 'The Realtors', 'Home Solutions', 'Estate Experts'],
        tech: ['Tech Solutions', 'Code & Create', 'Digital Dynamics', 'Tech Pro', 'Innovate Now', 'Byte Works', 'Tech Hub', 'The Developers'],
        healthcare: ['Health First', 'Care Plus', 'Wellness Center', 'Health Hub', 'Care Clinic', 'Wellness Pro', 'Health Care', 'The Clinic'],
        education: ['Learn & Grow', 'Knowledge Hub', 'Study Smart', 'Edu Pro', 'Learning Lab', 'Teach & Learn', 'Education Plus', 'The Academy'],
      };

      // Generate business name suggestions
      function generateSuggestions(businessType) {
        if (!businessType || !businessNameSuggestions[businessType]) {
          return [];
        }

        const baseSuggestions = businessNameSuggestions[businessType];
        const suggestions = [...baseSuggestions];
        
        // Add some variations
        const prefixes = ['Elite', 'Premium', 'Pro', 'Prime', 'Ultimate', 'Super'];
        const suffixes = ['Co', 'Group', 'Services', 'Solutions', 'Plus', 'Pro'];
        
        // Add a few random variations
        const randomPrefix = prefixes[Math.floor(Math.random() * prefixes.length)];
        const randomSuffix = suffixes[Math.floor(Math.random() * suffixes.length)];
        const baseName = baseSuggestions[0].split(' ')[0];
        
        suggestions.push(`${randomPrefix} ${baseName}`);
        suggestions.push(`${baseName} ${randomSuffix}`);
        
        // Shuffle and return 8 suggestions
        return suggestions.sort(() => Math.random() - 0.5).slice(0, 8);
      }

      // Display suggestions
      function displaySuggestions(suggestions) {
        if (suggestions.length === 0) {
          suggestionsDiv.style.display = 'none';
          return;
        }

        suggestionsDiv.innerHTML = `
          <div class="suggestions-label">Click a suggestion to use it:</div>
          <div class="suggestions-container">
            ${suggestions.map(name => 
              `<div class="suggestion-chip" data-name="${name}">${name}</div>`
            ).join('')}
          </div>
        `;
        suggestionsDiv.style.display = 'block';

        // Add click handlers
        suggestionsDiv.querySelectorAll('.suggestion-chip').forEach(chip => {
          chip.addEventListener('click', () => {
            nameInput.value = chip.dataset.name;
            suggestionsDiv.style.display = 'none';
          });
        });
      }

      // Tagline suggestions by business type
      const taglineSuggestions = {
        bakery: ['Fresh baked daily', 'Where tradition meets taste', 'Artisan breads & pastries', 'Sweet moments, every day', 'Baked with love', 'Your neighborhood bakery', 'Quality ingredients, quality taste', 'From our oven to your table'],
        hairdresser: ['Your style, our passion', 'Where beauty begins', 'Cut, color, confidence', 'Styling your best look', 'Expert cuts, expert care', 'Your hair, our art', 'Transform your style', 'Beauty redefined'],
        plumber: ['Reliable service, guaranteed', 'Your trusted plumbing experts', 'Fast, friendly, professional', '24/7 emergency service', 'Quality work, fair prices', 'We fix it right the first time', 'Your local plumbing pros', 'Drains, pipes, and more'],
        electrician: ['Powering your home safely', 'Licensed & insured', 'Expert electrical solutions', 'Your trusted electricians', 'Safe, reliable, professional', 'Brightening your world', 'Electrical excellence', 'Wired for success'],
        restaurant: ['Fresh ingredients, bold flavors', 'Where food meets passion', 'A taste of home', 'Locally sourced, globally inspired', 'Dining reimagined', 'Your neighborhood favorite', 'Culinary excellence', 'Flavors that bring people together'],
        fitness: ['Transform your body, transform your life', 'Your fitness journey starts here', 'Stronger every day', 'Train hard, live strong', 'Where goals become reality', 'Your personal fitness partner', 'Empower your potential', 'Fitness that fits you'],
        photography: ['Capturing life\'s precious moments', 'Your story, beautifully told', 'Memories that last forever', 'Professional photography services', 'Every picture tells a story', 'Preserving your special day', 'Artistic vision, timeless results', 'Where moments become memories'],
        consulting: ['Strategic solutions for growth', 'Your business success partner', 'Expert advice, proven results', 'Transforming businesses', 'Strategic thinking, actionable results', 'Your competitive advantage', 'Growth through expertise', 'Business solutions that work'],
        retail: ['Quality products, great prices', 'Your one-stop shop', 'Shop local, shop smart', 'Everything you need', 'Quality you can trust', 'Your favorite store', 'Shop with confidence', 'More than just a store'],
        cleaning: ['Spotless results, every time', 'Your home, professionally cleaned', 'Cleaning you can trust', 'Fresh, clean, healthy', 'Professional cleaning services', 'Making your space shine', 'Clean homes, happy families', 'Your cleaning experts'],
        landscaping: ['Transforming outdoor spaces', 'Your landscape design experts', 'Beautiful gardens, beautiful homes', 'Outdoor living reimagined', 'Creating your perfect outdoor space', 'Landscaping excellence', 'Nature meets design', 'Your outdoor oasis'],
        automotive: ['Your trusted auto care experts', 'Quality service, fair prices', 'Keeping you on the road', 'Expert mechanics, honest service', 'Auto repair you can trust', 'Your car care specialists', 'Professional auto service', 'Drive with confidence'],
        'real-estate': ['Finding your perfect home', 'Your real estate experts', 'Homes, dreams, reality', 'Expert guidance, proven results', 'Your property partners', 'Real estate made simple', 'Where dreams become addresses', 'Your home buying experts'],
        tech: ['Innovative solutions for modern business', 'Technology that works for you', 'Digital transformation experts', 'Your tech partners', 'Building the future, today', 'Tech solutions that scale', 'Innovation meets execution', 'Your digital advantage'],
        healthcare: ['Caring for your health', 'Your wellness partners', 'Quality healthcare, close to home', 'Health and wellness experts', 'Caring professionals, quality care', 'Your health, our priority', 'Wellness that works', 'Healthcare you can trust'],
        education: ['Empowering minds, shaping futures', 'Learning made personal', 'Your educational partners', 'Knowledge that transforms', 'Expert tutoring, proven results', 'Unlocking potential', 'Education excellence', 'Your learning journey starts here'],
      };

      // Generate tagline suggestions
      function generateTaglineSuggestions(businessType, businessName) {
        if (!businessType || !taglineSuggestions[businessType]) {
          return [];
        }
        const baseSuggestions = taglineSuggestions[businessType];
        const suggestions = [...baseSuggestions];
        
        // Add personalized suggestions if business name is provided
        if (businessName) {
          const nameWords = businessName.split(' ')[0];
          suggestions.push(`${nameWords} - Quality you can trust`);
          suggestions.push(`Welcome to ${businessName}`);
        }
        
        return suggestions.sort(() => Math.random() - 0.5).slice(0, 8);
      }

      // Display tagline suggestions
      function displayTaglineSuggestions(suggestions) {
        if (suggestions.length === 0) {
          taglineSuggestionsDiv.style.display = 'none';
          return;
        }

        taglineSuggestionsDiv.innerHTML = `
          <div class="suggestions-label" data-i18n="form.suggestionsLabel">Click a suggestion to use it:</div>
          <div class="suggestions-container">
            ${suggestions.map(tagline => 
              `<div class="suggestion-chip" data-tagline="${tagline}">${tagline}</div>`
            ).join('')}
          </div>
        `;
        // Update translations for dynamically added content
        window.i18n.updateTranslations();
        taglineSuggestionsDiv.style.display = 'block';

        taglineSuggestionsDiv.querySelectorAll('.suggestion-chip').forEach(chip => {
          chip.addEventListener('click', () => {
            taglineInput.value = chip.dataset.tagline;
            taglineSuggestionsDiv.style.display = 'none';
          });
        });
      }

      // Suggest button handler
      suggestBtn.addEventListener('click', () => {
        const businessType = businessTypeSelect.value;
        if (!businessType) {
          alert(window.i18n.t('error.pleaseSelectBusinessType'));
          return;
        }
        const suggestions = generateSuggestions(businessType);
        displaySuggestions(suggestions);
      });

      // Tagline suggest button handler
      suggestTaglineBtn.addEventListener('click', () => {
        const businessType = businessTypeSelect.value;
        const businessName = nameInput.value.trim();
        if (!businessType) {
          alert(window.i18n.t('error.pleaseSelectBusinessType'));
          return;
        }
        const suggestions = generateTaglineSuggestions(businessType, businessName);
        displayTaglineSuggestions(suggestions);
      });

      // Location detection from IP
      async function detectLocation() {
        try {
          const response = await fetch('/api/location');
          const data = await response.json();
          if (data.location) {
            locationInput.value = data.location;
            locationInput.placeholder = window.i18n.t('form.locationPlaceholderAlt');
          } else {
            locationInput.placeholder = window.i18n.t('form.locationPlaceholderAlt');
          }
        } catch (err) {
          console.error('Location detection failed:', err);
          locationInput.placeholder = window.i18n.t('form.locationPlaceholderAlt');
        }
      }

      // Hide playbook button (feature not implemented)
      if (createPlaybookBtn) {
        createPlaybookBtn.style.display = 'none';
      }

      // Progress indicator management
      function updateProgress(step) {
        document.querySelectorAll('.progress-step').forEach((el, index) => {
          const stepNum = index + 1;
          el.classList.remove('active', 'completed');
          if (stepNum < step) {
            el.classList.add('completed');
          } else if (stepNum === step) {
            el.classList.add('active');
          }
        });
      }

      // Update progress based on form interaction
      businessTypeSelect.addEventListener('change', () => {
        if (businessTypeSelect.value && nameInput.value.trim()) {
          updateProgress(2);
        }
      });

      nameInput.addEventListener('input', () => {
        if (nameInput.value.trim() && businessTypeSelect.value) {
          updateProgress(2);
        }
      });

      styleSelect.addEventListener('change', () => {
        if (nameInput.value.trim()) {
          updateProgress(2);
        }
      });

      // Icon picker functionality
      iconPickerBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        iconPickerModal.classList.toggle('active');
      });

      // Close icon picker when clicking outside
      document.addEventListener('click', (e) => {
        if (!iconPickerModal.contains(e.target) && e.target !== iconPickerBtn) {
          iconPickerModal.classList.remove('active');
        }
      });

      // Handle icon selection
      iconPickerModal.querySelectorAll('.icon-option').forEach(option => {
        option.addEventListener('click', () => {
          const selectedIcon = option.dataset.icon;
          iconInput.value = selectedIcon;
          
          // Update visual selection
          iconPickerModal.querySelectorAll('.icon-option').forEach(opt => {
            opt.classList.remove('selected');
          });
          option.classList.add('selected');
          
          // Close modal after a short delay
          setTimeout(() => {
            iconPickerModal.classList.remove('active');
          }, 300);
        });
      });

      // Update selected icon visual when input changes
      iconInput.addEventListener('input', () => {
        const currentIcon = iconInput.value;
        iconPickerModal.querySelectorAll('.icon-option').forEach(option => {
          option.classList.remove('selected');
          if (option.dataset.icon === currentIcon) {
            option.classList.add('selected');
          }
        });
      });

      // Auto-suggest icons based on business type
      businessTypeSelect.addEventListener('change', () => {
        const businessType = businessTypeSelect.value;
        const iconSuggestions = {
          bakery: '🍰',
          hairdresser: '💇',
          plumber: '🔧',
          electrician: '⚡',
          restaurant: '☕',
          fitness: '🏋️',
          photography: '📸',
          consulting: '💼',
          retail: '🛍️',
          cleaning: '✨',
          landscaping: '🌿',
          automotive: '🚗',
          'real-estate': '🏠',
          tech: '💻',
          healthcare: '💚',
          education: '📚',
        };
        
        if (iconSuggestions[businessType] && !iconInput.value) {
          iconInput.value = iconSuggestions[businessType];
        }
      });

      // Detect location on page load
      detectLocation();

      // Color palette definitions
      const colorPalettes = {
        warm: { font: '#8B4513', bg: '#FFF8DC' },
        cold: { font: '#1E3A8A', bg: '#E0F2FE' },
        earthy: { font: '#5D4037', bg: '#EFEBE9' },
        bold: { font: '#FFFFFF', bg: '#E91E63' },
        pastel: { font: '#6A5ACD', bg: '#F8BBD0' },
        monochrome: { font: '#212121', bg: '#FFFFFF' },
      };

      // Update colors when palette changes
      colorPaletteSelect.addEventListener('change', () => {
        const palette = colorPaletteSelect.value;
        if (palette === 'custom') {
          colorPickersDiv.style.display = 'block';
        } else {
          colorPickersDiv.style.display = 'block';
          const colors = colorPalettes[palette];
          if (colors) {
            fontColorInp.value = colors.font;
            bgColorInp.value = colors.bg;
          }
        }
      });

      async function generateLogo() {
        // Check authentication first
        if (!currentUser) {
          showAuthGate();
          return;
        }

        const name = nameInput.value.trim();
        const tagline = taglineInput.value.trim();
        const style = styleSelect.value.toLowerCase();
        const fontCategory = fontCategorySelect.value.toLowerCase();
        const icon = iconInput.value.trim();
        const layout = layoutSelect.value.toLowerCase();
        const shape = shapeSelect.value.toLowerCase();
        const colorPalette = colorPaletteSelect.value;
        let fontColor = fontColorInp.value;
        let bgColor = bgColorInp.value;

        // Apply color palette if not custom
        if (colorPalette !== 'custom' && colorPalettes[colorPalette]) {
          fontColor = colorPalettes[colorPalette].font;
          bgColor = colorPalettes[colorPalette].bg;
        }

        if (!name) {
          alert(window.i18n.t('error.pleaseEnterBusinessName'));
          return;
        }

        btn.disabled = true;
        btn.textContent = window.i18n.t('form.generating');
        previewDiv.innerHTML = `<div class="preview-placeholder" data-i18n="preview.generating">${window.i18n.t('preview.generating')}</div>`;

        const payload = {
          name,
          tagline: tagline || undefined,
          style,
          fontCategory,
          icon: icon || undefined,
          layout,
          shape,
          fontColor,
          bgColor,
        };


        try {
          const res = await fetch('/generate-logo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          if (!res.ok) throw new Error(await res.text());
          const { svgPath, pngPath } = await res.json();

          
          // Update progress to step 3
          updateProgress(3);
          
          // Store logo paths for favicon generation
          window.generatedLogoPaths = { svgPath, pngPath };
          
          previewDiv.innerHTML = `
            <img src="${pngPath}" alt="Logo Preview (PNG)" />
            <div class="downloads">
              <a href="#" class="logo-download-link" data-download-url="${svgPath}" data-i18n="preview.downloadSvg">${window.i18n.t('preview.downloadSvg')}</a>
              <a href="#" class="logo-download-link" data-download-url="${pngPath}" data-i18n="preview.downloadPng">${window.i18n.t('preview.downloadPng')}</a>
            </div>
            <div class="format-info">
              <strong data-i18n="preview.formatGuide">${window.i18n.t('preview.formatGuide')}</strong><br>
              <strong>SVG</strong> - <span data-i18n="preview.svgDescription">${window.i18n.t('preview.svgDescription')}</span><br>
              <strong>PNG</strong> - <span data-i18n="preview.pngDescription">${window.i18n.t('preview.pngDescription')}</span>
            </div>
            <div class="trust-badge">
              <span>✓</span> <span data-i18n="preview.usageRights">${window.i18n.t('preview.usageRights')}</span>
            </div>
          `;
          // Update translations for dynamically added content
          window.i18n.updateTranslations();
          
          // Show favicon section after logo is generated
          setTimeout(() => {
            showFaviconSection();
          }, 500);
        } catch (err) {
          console.error('❌ Generation error:', err);
          previewDiv.innerHTML = `<div class="preview-placeholder error" data-i18n="preview.error">${window.i18n.t('preview.error')}</div>`;
        } finally {
          btn.disabled = false;
          btn.textContent = window.i18n.t('form.generateLogo');
        }
      }

      btn.addEventListener('click', () => {
        generateLogo();
      });

      // Favicon generation
      const faviconSection = document.getElementById('faviconSection');
      const faviconUseLogoSection = document.getElementById('faviconUseLogoSection');
      const faviconLogoPreview = document.getElementById('faviconLogoPreview');
      const useLogoForFaviconBtn = document.getElementById('useLogoForFaviconBtn');
      const faviconAutoOptions = document.getElementById('faviconAutoOptions');
      const generateAutoFaviconBtn = document.getElementById('generateAutoFaviconBtn');
      const faviconManualSection = document.getElementById('faviconManualSection');
      const toggleManualFaviconBtn = document.getElementById('toggleManualFaviconBtn');
      const faviconTextInput = document.getElementById('faviconText');
      const faviconStyleSelect = document.getElementById('faviconStyle');
      const faviconFontCategorySelect = document.getElementById('faviconFontCategory');
      const faviconShapeSelect = document.getElementById('faviconShape');
      const faviconFontColorInput = document.getElementById('faviconFontColor');
      const faviconBgColorInput = document.getElementById('faviconBgColor');
      const generateFaviconBtn = document.getElementById('generateFaviconBtn');
      const faviconPreviewSection = document.getElementById('faviconPreviewSection');
      const faviconPreview = document.getElementById('faviconPreview');
      const faviconHtmlCode = document.getElementById('faviconHtmlCode');
      const downloadAllFaviconsBtn = document.getElementById('downloadAllFaviconsBtn');

      // Show favicon section after logo is generated
      function showFaviconSection() {
        if (!faviconSection) return;
        faviconSection.style.display = 'block';
        updateProgress(4);
        
        // Scroll to favicon section
        setTimeout(() => {
          faviconSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
        
        // Show "use logo" option if logo was generated
        if (window.generatedLogoPaths && window.generatedLogoPaths.pngPath && faviconUseLogoSection) {
          faviconUseLogoSection.style.display = 'block';
          if (faviconLogoPreview) {
            faviconLogoPreview.innerHTML = `<img src="${window.generatedLogoPaths.pngPath}" alt="Logo" style="width: 100%; height: 100%; object-fit: contain;" />`;
          }
        }
      }

      // Auto-generate favicon options based on business info
      function generateAutoFaviconOptions() {
        // Check authentication first
        if (!currentUser) {
          showAuthGate();
          return;
        }

        const businessName = nameInput.value.trim();
        const businessType = businessTypeSelect.value;
        
        if (!businessName) {
          alert(window.i18n.t('error.pleaseEnterBusinessName'));
          return;
        }

        // Get first 1-2 letters of business name
        const initials = businessName.substring(0, 2).toUpperCase();
        const firstLetter = businessName.substring(0, 1).toUpperCase();
        
        // Generate creative options
        const options = [
          {
            text: firstLetter,
            style: 'minimal',
            shape: 'circle',
            fontCategory: 'bold',
            fontColor: '#ffffff',
            bgColor: '#10a37f',
            name: 'Minimal Circle'
          },
          {
            text: initials,
            style: 'flat',
            shape: 'square',
            fontCategory: 'modern',
            fontColor: '#ffffff',
            bgColor: '#1a1a1a',
            name: 'Modern Square'
          },
          {
            text: firstLetter,
            style: 'gradient',
            shape: 'rounded',
            fontCategory: 'elegant',
            fontColor: '#ffffff',
            bgColor: '#6366f1',
            name: 'Elegant Gradient'
          },
          {
            text: initials,
            style: 'outline',
            shape: 'circle',
            fontCategory: 'bold',
            fontColor: '#10a37f',
            bgColor: 'transparent',
            name: 'Bold Outline'
          }
        ];

        // Display options
        if (faviconAutoOptions) {
          faviconAutoOptions.innerHTML = options.map((option, index) => `
            <div style="background: #1f1f1f; border: 1px solid #2a2a2a; border-radius: 8px; padding: 16px; text-align: center; cursor: pointer; transition: all 0.2s;" 
                 class="favicon-option" 
                 data-option-index="${index}"
                 onmouseover="this.style.borderColor='#10a37f'" 
                 onmouseout="this.style.borderColor='#2a2a2a'">
              <div style="width: 64px; height: 64px; margin: 0 auto 12px; border-radius: ${option.shape === 'circle' ? '50%' : option.shape === 'rounded' ? '12px' : '4px'}; background: ${option.bgColor === 'transparent' ? '#0d0d0d' : option.bgColor}; display: flex; align-items: center; justify-content: center; border: ${option.bgColor === 'transparent' ? '2px solid ' + option.fontColor : 'none'};">
                <span style="color: ${option.fontColor}; font-size: 32px; font-weight: 600;">${option.text}</span>
              </div>
              <div style="font-size: 12px; color: #ececec; font-weight: 500;">${option.name}</div>
            </div>
          `).join('');

          // Store options for later use
          window.faviconAutoOptions = options;

          // Add click handlers
          faviconAutoOptions.querySelectorAll('.favicon-option').forEach((el, index) => {
            el.addEventListener('click', () => {
              const option = options[index];
              generateFaviconFromOption(option);
            });
          });
        }
      }

      // Generate favicon from auto option
      async function generateFaviconFromOption(option) {
        if (faviconTextInput) faviconTextInput.value = option.text;
        if (faviconStyleSelect) faviconStyleSelect.value = option.style;
        if (faviconShapeSelect) faviconShapeSelect.value = option.shape;
        if (faviconFontCategorySelect) faviconFontCategorySelect.value = option.fontCategory;
        if (faviconFontColorInput) faviconFontColorInput.value = option.fontColor;
        if (faviconBgColorInput) faviconBgColorInput.value = option.bgColor === 'transparent' ? '#000000' : option.bgColor;
        
        // Generate the favicon
        await generateFavicon();
      }

      // Use logo for favicon
      async function useLogoForFavicon() {
        // Check authentication first
        if (!currentUser) {
          showAuthGate();
          return;
        }

        if (!window.generatedLogoPaths || !window.generatedLogoPaths.pngPath) {
          alert('Please generate a logo first');
          return;
        }

        if (useLogoForFaviconBtn) {
          useLogoForFaviconBtn.disabled = true;
          useLogoForFaviconBtn.textContent = window.i18n.t('form.generating');
        }
        if (faviconPreviewSection) faviconPreviewSection.style.display = 'none';

        try {
          const res = await fetch('/generate-favicon-from-logo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              logoPath: window.generatedLogoPaths.pngPath
            }),
            credentials: 'include',
          });

          if (!res.ok) {
            throw new Error(await res.text());
          }

          const { files } = await res.json();
          displayFaviconResults(files);
        } catch (err) {
          console.error('❌ Error generating favicon from logo:', err);
          alert(window.i18n.t('favicon.error.generationFailed'));
        } finally {
          if (useLogoForFaviconBtn) {
            useLogoForFaviconBtn.disabled = false;
            useLogoForFaviconBtn.textContent = window.i18n.t('favicon.useLogo.button');
          }
        }
      }

      // Display favicon results
      function displayFaviconResults(files) {
        if (!faviconPreview) return;
        
        const faviconSizes = [
          { key: 'favicon-16x16', label: '16×16', desc: 'Standard favicon' },
          { key: 'favicon-32x32', label: '32×32', desc: 'Standard favicon' },
          { key: 'favicon-48x48', label: '48×48', desc: 'Standard favicon' },
          { key: 'apple-touch-icon', label: '180×180', desc: 'Apple touch icon' },
          { key: 'android-chrome-192x192', label: '192×192', desc: 'Android Chrome' },
          { key: 'android-chrome-512x512', label: '512×512', desc: 'Android Chrome' },
        ];

        faviconPreview.innerHTML = faviconSizes
          .filter(size => files[size.key])
          .map(size => {
            const file = files[size.key];
            return `
              <div style="background: #1f1f1f; border: 1px solid #2a2a2a; border-radius: 8px; padding: 16px; text-align: center;">
                <div style="margin-bottom: 12px;">
                  <img src="${file.png}" alt="${size.label}" style="width: 64px; height: 64px; image-rendering: pixelated; border: 1px solid #2a2a2a; border-radius: 4px;" />
                </div>
                <div style="font-size: 13px; font-weight: 600; color: #ececec; margin-bottom: 4px;">${size.label}</div>
                <div style="font-size: 11px; color: #8e8e93; margin-bottom: 12px;">${size.desc}</div>
                <div style="display: flex; gap: 8px; justify-content: center;">
                  <a href="${file.png}" download="${size.key}.png" style="padding: 6px 12px; background: #10a37f; color: #fff; border-radius: 4px; font-size: 12px; text-decoration: none;">PNG</a>
                  <a href="${file.svg}" download="${size.key}.svg" style="padding: 6px 12px; background: #1f1f1f; border: 1px solid #2a2a2a; color: #ececec; border-radius: 4px; font-size: 12px; text-decoration: none;">SVG</a>
                </div>
              </div>
            `;
          })
          .join('');

        // Generate HTML code
        const baseUrl = window.location.origin;
        const htmlCode = `<!-- Favicon -->
<link rel="icon" type="image/png" sizes="16x16" href="${baseUrl}${files['favicon-16x16']?.png || ''}">
<link rel="icon" type="image/png" sizes="32x32" href="${baseUrl}${files['favicon-32x32']?.png || ''}">
<link rel="icon" type="image/png" sizes="48x48" href="${baseUrl}${files['favicon-48x48']?.png || ''}">
<link rel="apple-touch-icon" sizes="180x180" href="${baseUrl}${files['apple-touch-icon']?.png || ''}">
<link rel="icon" type="image/png" sizes="192x192" href="${baseUrl}${files['android-chrome-192x192']?.png || ''}">
<link rel="icon" type="image/png" sizes="512x512" href="${baseUrl}${files['android-chrome-512x512']?.png || ''}">`;

        if (faviconHtmlCode) faviconHtmlCode.textContent = htmlCode;
        if (faviconPreviewSection) faviconPreviewSection.style.display = 'block';
        window.i18n.updateTranslations();
      }

      async function generateFavicon() {
        // Check authentication first
        if (!currentUser) {
          showAuthGate();
          return;
        }

        const text = faviconTextInput.value.trim().toUpperCase();
        const fontCategory = faviconFontCategorySelect.value.toLowerCase();
        const shape = faviconShapeSelect.value.toLowerCase();
        const fontColor = faviconFontColorInput.value;
        const bgColor = faviconBgColorInput.value;

        if (!text || text.length === 0) {
          alert(window.i18n.t('favicon.error.noText'));
          return;
        }

        if (text.length > 2) {
          alert(window.i18n.t('favicon.error.tooLong'));
          return;
        }

        if (generateFaviconBtn) {
          generateFaviconBtn.disabled = true;
          generateFaviconBtn.textContent = window.i18n.t('form.generating');
        }
        if (faviconPreviewSection) faviconPreviewSection.style.display = 'none';

        const payload = {
          text,
          fontCategory,
          shape,
          fontColor,
          bgColor,
          style,
        };


        try {
          const res = await fetch('/generate-favicon', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            credentials: 'include',
          });
          if (!res.ok) {
            const errorText = await res.text();
            throw new Error(errorText);
          }
          const { files } = await res.json();

          displayFaviconResults(files);
          
          // Show favicon section and scroll to it
          showFaviconSection();
        } catch (err) {
          console.error('❌ Favicon generation error:', err);
          alert(window.i18n.t('favicon.error.generationFailed'));
        } finally {
          if (generateFaviconBtn) {
            generateFaviconBtn.disabled = false;
            generateFaviconBtn.textContent = window.i18n.t('favicon.generate');
          }
        }
      }

      if (generateFaviconBtn) {
        generateFaviconBtn.addEventListener('click', () => {
          generateFavicon();
        });
      }

      // Event handlers for new favicon features
      if (useLogoForFaviconBtn) {
        useLogoForFaviconBtn.addEventListener('click', useLogoForFavicon);
      }
      if (generateAutoFaviconBtn) {
        generateAutoFaviconBtn.addEventListener('click', generateAutoFaviconOptions);
      }
      if (toggleManualFaviconBtn && faviconManualSection) {
        toggleManualFaviconBtn.addEventListener('click', () => {
          faviconManualSection.style.display = faviconManualSection.style.display === 'none' ? 'block' : 'none';
          toggleManualFaviconBtn.textContent = faviconManualSection.style.display === 'none' 
            ? window.i18n.t('favicon.manual.toggle') 
            : window.i18n.t('favicon.manual.hide');
        });
      }

      // AVI to MP4 Converter functionality
      const aviFileInput = document.getElementById('aviFileInput');
      const convertVideoBtn = document.getElementById('convertVideoBtn');
      const fileInfo = document.getElementById('fileInfo');
      const conversionProgress = document.getElementById('conversionProgress');
      const conversionResult = document.getElementById('conversionResult');
      const conversionError = document.getElementById('conversionError');
      const progressBar = document.getElementById('progressBar');
      const progressText = document.getElementById('progressText');
      const downloadLink = document.getElementById('downloadLink');

      if (aviFileInput) {
        aviFileInput.addEventListener('change', (e) => {
          const file = e.target.files[0];
          if (file) {
            const fileSizeMB = (file.size / 1024 / 1024).toFixed(2);
            const maxSizeMB = 500;
            
            if (file.size > maxSizeMB * 1024 * 1024) {
              fileInfo.textContent = `❌ File too large. Maximum size is ${maxSizeMB}MB.`;
              fileInfo.style.color = '#ff453a';
              convertVideoBtn.disabled = true;
            } else if (!file.name.toLowerCase().endsWith('.avi')) {
              fileInfo.textContent = '❌ Only AVI files are supported.';
              fileInfo.style.color = '#ff453a';
              convertVideoBtn.disabled = true;
            } else {
              fileInfo.textContent = `✅ Selected: ${file.name} (${fileSizeMB} MB)`;
              fileInfo.style.color = '#10a37f';
              convertVideoBtn.disabled = false;
            }
            
            // Hide previous results/errors
            conversionResult.style.display = 'none';
            conversionError.style.display = 'none';
          } else {
            fileInfo.textContent = '';
            convertVideoBtn.disabled = true;
          }
        });
      }

      async function convertVideo() {
        const file = aviFileInput?.files[0];
        if (!file) {
          conversionError.textContent = 'Please select a file first.';
          conversionError.style.display = 'block';
          return;
        }

        // Check authentication
        if (!currentUser) {
          window.showAuthGate();
          return;
        }

        // Reset UI
        conversionProgress.style.display = 'block';
        conversionResult.style.display = 'none';
        conversionError.style.display = 'none';
        convertVideoBtn.disabled = true;
        progressBar.style.width = '0%';
        progressText.textContent = '0%';

        const formData = new FormData();
        formData.append('video', file);

        try {
          const response = await fetch('/convert-avi-to-mp4', {
            method: 'POST',
            body: formData,
            credentials: 'include',
          });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error || 'Conversion failed');
          }

          // Show success
          conversionProgress.style.display = 'none';
          conversionResult.style.display = 'block';
          downloadLink.href = data.downloadUrl;
          downloadLink.download = data.filename || 'converted-video.mp4';

          // Update usage limits if provided
          if (data.usageLimits) {
            updateUsageDisplay(data.usageLimits);
          }
        } catch (err) {
          console.error('Conversion error:', err);
          conversionProgress.style.display = 'none';
          conversionError.textContent = err.message || 'An error occurred during conversion. Please try again.';
          conversionError.style.display = 'block';
        } finally {
          convertVideoBtn.disabled = false;
        }
      }

      if (convertVideoBtn) {
        convertVideoBtn.addEventListener('click', convertVideo);
      }

      // Close auth gate when clicking outside
      document.addEventListener('click', (e) => {
        const authGate = document.getElementById('authGate');
        if (authGate && authGate.classList.contains('active') && e.target === authGate) {
          window.closeAuthGate();
        }
      });

      // Accessibility: Close modals and auth gate with Escape key
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          // Close any open modal
          const loginModal = document.getElementById('loginModal');
          const signupModal = document.getElementById('signupModal');
          const forgotPasswordModal = document.getElementById('forgotPasswordModal');
          const authGate = document.getElementById('authGate');
          
          if (loginModal && loginModal.classList.contains('active')) {
            window.closeLoginModal();
            e.preventDefault();
            e.stopPropagation();
          } else if (signupModal && signupModal.classList.contains('active')) {
            window.closeSignupModal();
            e.preventDefault();
            e.stopPropagation();
          } else if (forgotPasswordModal && forgotPasswordModal.classList.contains('active')) {
            window.closeForgotPasswordModal();
            e.preventDefault();
            e.stopPropagation();
          } else if (authGate && authGate.classList.contains('active')) {
            window.closeAuthGate();
            e.preventDefault();
            e.stopPropagation();
          }
        }
      });

      window.addEventListener('DOMContentLoaded', async () => {
        
        // Ensure homepage is visible and logo generator is hidden by default
        const homepage = document.getElementById('homepage');
        const logoGenerator = document.getElementById('logoGenerator');

        if (homepage) {
          homepage.style.display = 'block';
        }

        if (logoGenerator) {
          logoGenerator.style.display = 'none';
        }
        
        // Add event listeners to buttons (using event listeners instead of onclick)
        const loginBtn = document.getElementById('loginBtn');
        const signupBtn = document.getElementById('signupBtn');
        const heroSignupBtn = document.getElementById('heroSignupBtn');
        const heroLoginBtn = document.getElementById('heroLoginBtn');
        const allToolsBtn = document.getElementById('allToolsBtn');
        
        if (loginBtn) {
          loginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (typeof window.openLoginModal === 'function') {
              window.openLoginModal();
            } else {
              console.error('❌ window.openLoginModal is not a function!');
            }
          });
        } else {
          console.error('❌ Login button not found!');
        }
        
        if (signupBtn) {
          signupBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (typeof window.openSignupModal === 'function') {
              window.openSignupModal();
            } else {
              console.error('❌ window.openSignupModal is not a function!');
            }
          });
        } else {
          console.error('❌ Signup button not found!');
        }
        
        if (heroSignupBtn) {
          heroSignupBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            // Same action as startLogoBtn: show logo generator to create your business and logo
            const homepage = document.getElementById('homepage');
            const logoGenerator = document.getElementById('logoGenerator');
            if (homepage) homepage.style.display = 'none';
            if (logoGenerator) logoGenerator.style.display = 'block';
            setTimeout(() => {
              if (typeof loadAllFooters === 'function') loadAllFooters();
              if (window.i18n && window.i18n.updateTranslations) window.i18n.updateTranslations();
            }, 100);
          });
        }
        
        if (heroLoginBtn) {
          heroLoginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (typeof window.openLoginModal === 'function') {
              window.openLoginModal();
            }
          });
        }
        
        if (allToolsBtn) {
          allToolsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (typeof window.openSignupModal === 'function') {
              window.openSignupModal();
            }
          });
        }

        // Start Logo button - show logo generator for everyone (no sign-up required to try it)
        const startLogoBtn = document.getElementById('startLogoBtn');
        if (startLogoBtn) {
          startLogoBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const homepage = document.getElementById('homepage');
            const logoGenerator = document.getElementById('logoGenerator');
            if (homepage) homepage.style.display = 'none';
            if (logoGenerator) logoGenerator.style.display = 'block';
            setTimeout(() => {
              if (typeof loadAllFooters === 'function') loadAllFooters();
              if (window.i18n && window.i18n.updateTranslations) window.i18n.updateTranslations();
            }, 100);
          });
        }

        // Add event listeners to tool cards
        document.querySelectorAll('[data-tool-card="true"]').forEach(card => {
          card.style.cursor = 'pointer';
          card.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            // Special handling for AVI to MP4 converter - navigate to dedicated page
            if (card.id === 'aviToMp4Card' || card.closest('#aviToMp4Card')) {
              window.location.href = '/video-converter';
              return;
            }
            
            // Default behavior for other tool cards
            e.stopPropagation();
            if (typeof window.showAuthGate === 'function') {
              window.showAuthGate();
            } else {
              console.error('❌ window.showAuthGate is not a function!');
            }
          });
          // Also make the card keyboard accessible
          card.setAttribute('tabindex', '0');
          card.setAttribute('role', 'button');
          card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              if (typeof window.showAuthGate === 'function') {
                window.showAuthGate();
              }
            }
          });
        });

        // Initialize i18n first
        await window.i18n.init();
        
        // Force update translations after a short delay to ensure DOM is ready
        setTimeout(() => {
          window.i18n.updateTranslations();
        }, 200);
        
        // Also update translations after auth check (homepage might be shown)
        setTimeout(() => {
          window.i18n.updateTranslations();
        }, 500);
        
        // Update language selector to current language
        const langSelector = document.getElementById('languageSelector');
        if (langSelector) {
          langSelector.value = window.i18n.getCurrentLanguage();
          langSelector.addEventListener('change', async (e) => {
            await window.i18n.setLanguage(e.target.value);
          });
        }
        
        const params = new URLSearchParams(location.search);
        const n = params.get('name');
        if (n) {
          nameInput.value = n;
          setTimeout(generateLogo, 100);
        }
        
        // Check authentication status on load
        checkAuthStatus();
        
        // Check for OAuth callback success
        if (params.get('auth_success') === 'true') {
          checkAuthStatus();
          // Remove query param
          window.history.replaceState({}, document.title, window.location.pathname);
        }
        
        // Gate logo download links: require sign-up, then allow download
        document.addEventListener('click', (e) => {
          const link = e.target.closest('a.logo-download-link');
          if (!link) return;
          e.preventDefault();
          const url = link.getAttribute('data-download-url');
          if (!url) return;
          if (!currentUser) {
            sessionStorage.setItem('pendingLogoDownload', url);
            if (typeof window.openSignupModal === 'function') {
              window.openSignupModal();
            }
            return;
          }
          const a = document.createElement('a');
          a.href = url;
          a.download = url.split('/').pop() || 'logo';
          a.style.display = 'none';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        });
      });

      // Authentication functions
      let currentUser = null;

      async function checkAuthStatus() {
        try {
          const response = await fetch('/auth/me');
          if (response.ok) {
            const data = await response.json();
            currentUser = data.user;
            updateAuthUI(data.user);
            loadUsageLimits();
            loadAds();
            // If user just signed up to download, trigger the pending download
            const pendingDownload = sessionStorage.getItem('pendingLogoDownload');
            if (pendingDownload) {
              sessionStorage.removeItem('pendingLogoDownload');
              setTimeout(() => {
                const a = document.createElement('a');
                a.href = pendingDownload;
                a.download = pendingDownload.split('/').pop() || 'logo';
                a.style.display = 'none';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
              }, 300);
            }
          } else {
            currentUser = null;
            updateAuthUI(null);
            hideAds();
          }
        } catch (err) {
          console.error('Auth check error:', err);
          currentUser = null;
          updateAuthUI(null);
        }
      }

      function updateAuthUI(user) {
        const authButtons = document.getElementById('authButtons');
        const userInfo = document.getElementById('userInfo');
        const homepage = document.getElementById('homepage');
        const logoGenerator = document.getElementById('logoGenerator');

        if (user) {
          authButtons.style.display = 'none';
          userInfo.style.display = 'flex';
          document.getElementById('userName').textContent = user.name || user.email;
          document.getElementById('userAvatar').textContent = (user.name || user.email || 'U')[0].toUpperCase();
          if (user.avatarUrl) {
            document.getElementById('userAvatar').style.backgroundImage = `url(${user.avatarUrl})`;
            document.getElementById('userAvatar').style.backgroundSize = 'cover';
          }
          // Update language selector to current language
          const langSelector = document.getElementById('languageSelector');
          if (langSelector) {
            langSelector.value = window.i18n.getCurrentLanguage();
          }
          
          // Show logo generator, hide homepage
          if (homepage) {
            homepage.style.display = 'none';
          }
          if (logoGenerator) {
            logoGenerator.style.display = 'block';
          }
          
          // Update translations for logo generator after it's shown
          setTimeout(() => {
            window.i18n.updateTranslations();
          }, 100);
        } else {
          authButtons.style.display = 'flex';
          userInfo.style.display = 'none';
          
          // Show homepage, hide logo generator
          if (homepage) {
            homepage.style.display = 'block';
          }
          if (logoGenerator) {
            logoGenerator.style.display = 'none';
          }
          
          // Ensure footer is loaded when homepage is shown
          setTimeout(() => {
            if (typeof loadAllFooters === 'function') {
              loadAllFooters();
            }
            window.i18n.updateTranslations();
          }, 100);
        }
      }

      async function loadUsageLimits() {
        if (!currentUser) return;
        
        try {
          const response = await fetch('/api/usage-limits');
          if (response.ok) {
            const limits = await response.json();
            const remaining = limits.remaining;
            document.getElementById('usageInfo').textContent = 
              window.i18n.t('usage.dailyRemaining', { daily: remaining.daily, hourly: remaining.hourly });
          }
        } catch (err) {
          console.error('Error loading usage limits:', err);
        }
      }

      // Modal functions are already defined at the top of the script

      // Close modals on outside click
      document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
          if (e.target === modal) {
            modal.classList.remove('active');
          }
        });
      });

      // Auth handlers
      async function handleLogin(event) {
        event.preventDefault();
        const errorDiv = document.getElementById('loginError');
        errorDiv.innerHTML = '';

        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;

        try {
          const response = await fetch('/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
            credentials: 'include',
          });

          const data = await response.json();

          if (response.ok) {
            if (data.needsVerification) {
              errorDiv.innerHTML = `<div class="success-message">${window.i18n.t('success.emailVerified')}. ${window.i18n.t('auth.forgotPassword')}</div>`;
            } else {
              closeLoginModal();
              await checkAuthStatus();
              
              // Check for redirect parameter
              const urlParams = new URLSearchParams(window.location.search);
              const redirect = urlParams.get('redirect');
              if (redirect) {
                window.location.href = redirect;
              } else {
                // After successful login, logo generator will be shown via updateAuthUI
                // Refresh the page to ensure all state is updated
                window.location.reload();
              }
            }
          } else {
            const errorMsg = data.error || window.i18n.t('error.loginFailed');
            errorDiv.innerHTML = `<div class="error-message">${errorMsg}</div>`;
          }
        } catch (err) {
          errorDiv.innerHTML = `<div class="error-message">${window.i18n.t('error.networkError')}</div>`;
        }
      }

      async function handleSignup(event) {
        event.preventDefault();
        const errorDiv = document.getElementById('signupError');
        errorDiv.innerHTML = '';

        const email = document.getElementById('signupEmail').value;
        const password = document.getElementById('signupPassword').value;
        const passwordConfirm = document.getElementById('signupPasswordConfirm').value;
        const termsAccepted = document.getElementById('signupTerms').checked;

        // Validate password confirmation
        if (password !== passwordConfirm) {
          errorDiv.innerHTML = '<div class="error-message">Passwords do not match</div>';
          return;
        }

        // Validate terms acceptance
        if (!termsAccepted) {
          errorDiv.innerHTML = '<div class="error-message">You must accept the Terms and Conditions</div>';
          return;
        }

        try {
          const response = await fetch('/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
            credentials: 'include',
          });

          const data = await response.json();

          if (response.ok) {
            errorDiv.innerHTML = `<div class="success-message">${window.i18n.t('success.registrationSuccessful')}</div>`;
            // Check if user is now authenticated (OAuth users) or needs email verification
            setTimeout(async () => {
              await checkAuthStatus();
              closeSignupModal();
              // If still not authenticated, show login modal
              if (!currentUser) {
                openLoginModal();
              }
            }, 2000);
          } else {
            const errorMsg = data.error || window.i18n.t('error.registrationFailed');
            errorDiv.innerHTML = `<div class="error-message">${errorMsg}</div>`;
          }
        } catch (err) {
          errorDiv.innerHTML = `<div class="error-message">${window.i18n.t('error.networkError')}</div>`;
        }
      }

      async function handleForgotPassword(event) {
        event.preventDefault();
        const errorDiv = document.getElementById('forgotPasswordError');
        errorDiv.innerHTML = '';

        const email = document.getElementById('forgotPasswordEmail').value;

        try {
          const response = await fetch('/auth/forgot-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
          });

          const data = await response.json();

          if (response.ok) {
            errorDiv.innerHTML = `<div class="success-message">${window.i18n.t('success.passwordResetSent')}</div>`;
          } else {
            const errorMsg = data.error || window.i18n.t('error.networkError');
            errorDiv.innerHTML = `<div class="error-message">${errorMsg}</div>`;
          }
        } catch (err) {
          errorDiv.innerHTML = `<div class="error-message">${window.i18n.t('error.networkError')}</div>`;
        }
      }

      async function logout() {
        try {
          await fetch('/auth/logout', {
            method: 'POST',
            credentials: 'include',
          });
          currentUser = null;
          updateAuthUI(null);
          hideAds();
          // Scroll to top after logout
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (err) {
          console.error('Logout error:', err);
        }
      }

      // Ad integration
      function loadAds() {
        if (!currentUser || currentUser.subscriptionTier !== 'free') {
          hideAds();
          return;
        }

        const adContainer = document.getElementById('adContainer');
        const adSenseContainer = document.getElementById('adSenseContainer');
        
        adContainer.style.display = 'block';
        
        // Google AdSense integration
        // AdSense script is already loaded in the <head> section
        const adsenseClientId = 'ca-pub-2385399270661663';

        // Create ad unit (you'll need to configure this in AdSense)
        if (!adSenseContainer.querySelector('ins')) {
          const adUnit = document.createElement('ins');
          adUnit.className = 'adsbygoogle';
          adUnit.style.display = 'block';
          adUnit.setAttribute('data-ad-client', adsenseClientId);
          adUnit.setAttribute('data-ad-slot', '1234567890'); // Replace with your ad slot
          adUnit.setAttribute('data-ad-format', 'auto');
          adUnit.setAttribute('data-full-width-responsive', 'true');
          
          adSenseContainer.innerHTML = '';
          adSenseContainer.appendChild(adUnit);
          
          // Push ad to AdSense
          if (window.adsbygoogle) {
            try {
              (window.adsbygoogle = window.adsbygoogle || []).push({});
            } catch (e) {
              console.error('AdSense error:', e);
            }
          }
        }
      }

      function hideAds() {
        document.getElementById('adContainer').style.display = 'none';
      }

// Footer loading script
      // Load footer - ensure it loads after DOM is ready
      function loadFooter(containerId = 'footer-container') {
        const footerContainer = document.getElementById(containerId);
        if (!footerContainer) {
          console.error(`Footer container not found: ${containerId}`);
          return;
        }
        // Add version query parameter to force cache refresh
        const version = new Date().getTime();
        fetch(`/footer.html?v=${version}`)
          .then(response => {
            if (!response.ok) {
              throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.text();
          })
          .then(html => {
            footerContainer.innerHTML = html;
            // Sync footer language selector
            const mainSelector = document.getElementById('languageSelector');
            const footerSelector = document.getElementById('footerLanguageSelector');
            if (mainSelector && footerSelector) {
              footerSelector.value = mainSelector.value || (window.i18n?.getCurrentLanguage && window.i18n.getCurrentLanguage()) || 'en';
              mainSelector.addEventListener('change', () => {
                footerSelector.value = mainSelector.value;
              });
              footerSelector.addEventListener('change', () => {
                mainSelector.value = footerSelector.value;
                if (typeof window.i18n !== 'undefined' && window.i18n.setLanguage) {
                  window.i18n.setLanguage(footerSelector.value);
                }
              });
            }
          })
          .catch(err => console.error('Error loading footer:', err));
      }
      
      // Load footer for both homepage and logoGenerator sections
      function loadAllFooters() {
        loadFooter('footer-container'); // Homepage footer
        loadFooter('footer-container-logo'); // Logo generator footer
      }
      
      // Load footer when DOM is ready - use setTimeout to ensure it runs after all other scripts
      setTimeout(() => {
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', loadAllFooters);
        } else {
          // DOM is already ready
          loadAllFooters();
        }
      }, 100);
