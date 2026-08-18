/* ============================================================================
   FLORÈVE — Storefront behaviour
   Vanilla, dependency-free, progressively enhanced. Every interaction here has
   a working no-JavaScript fallback in the markup that calls it.
   ========================================================================= */

(function () {
  'use strict';

  var Floreve = (window.Floreve = window.Floreve || {});
  var routes = Floreve.routes || {};
  var strings = Floreve.strings || {};

  /* ------------------------------------------------------------- Utilities */

  function $(selector, scope) {
    return (scope || document).querySelector(selector);
  }

  function $$(selector, scope) {
    return Array.prototype.slice.call((scope || document).querySelectorAll(selector));
  }

  function on(el, type, handler, options) {
    if (el) el.addEventListener(type, handler, options);
  }

  function debounce(fn, wait) {
    var timer;
    return function () {
      var args = arguments;
      var ctx = this;
      clearTimeout(timer);
      timer = setTimeout(function () {
        fn.apply(ctx, args);
      }, wait);
    };
  }

  function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /**
   * Shopify's canonical money formatter, kept here so variant switches never
   * need a network round-trip to show a price.
   */
  function formatMoney(cents, format) {
    if (typeof cents === 'string') cents = cents.replace('.', '');
    var value = '';
    var placeholderRegex = /\{\{\s*(\w+)\s*\}\}/;
    var formatString = format || Floreve.moneyFormat || '${{amount}}';

    function defaultTo(number, size) {
      var str = '000000000' + number;
      return str.substring(str.length - size);
    }

    function thousands(number, precision, thousandsSep, decimalSep) {
      precision = isNaN(precision) ? 2 : precision;
      thousandsSep = thousandsSep === undefined ? ',' : thousandsSep;
      decimalSep = decimalSep === undefined ? '.' : decimalSep;

      var amount = (Math.abs(Number(number) || 0) / 100).toFixed(precision);
      var parts = amount.split('.');
      var whole = parts[0].replace(/(\d)(?=(\d\d\d)+(?!\d))/g, '$1' + thousandsSep);
      var fraction = parts[1] ? decimalSep + defaultTo(parts[1], precision) : '';
      return (Number(number) < 0 ? '-' : '') + whole + fraction;
    }

    var match = formatString.match(placeholderRegex);
    if (!match) return formatString;

    switch (match[1]) {
      case 'amount':
        value = thousands(cents, 2);
        break;
      case 'amount_no_decimals':
        value = thousands(cents, 0);
        break;
      case 'amount_with_comma_separator':
        value = thousands(cents, 2, '.', ',');
        break;
      case 'amount_with_apostrophe_separator':
        value = thousands(cents, 2, "'", '.');
        break;
      case 'amount_no_decimals_with_comma_separator':
        value = thousands(cents, 0, '.', ',');
        break;
      case 'amount_no_decimals_with_space_separator':
        value = thousands(cents, 0, ' ', ',');
        break;
      case 'amount_with_space_separator':
        value = thousands(cents, 2, ' ', ',');
        break;
      case 'amount_with_period_and_space_separator':
        value = thousands(cents, 2, ' ', '.');
        break;
      default:
        value = thousands(cents, 2);
    }

    return formatString.replace(placeholderRegex, value);
  }

  Floreve.formatMoney = formatMoney;

  function fetchJSON(url, options) {
    return fetch(url, options).then(function (response) {
      return response.json().then(function (data) {
        if (!response.ok) {
          var error = new Error(data.description || data.message || 'Request failed');
          error.data = data;
          throw error;
        }
        return data;
      });
    });
  }

  /* ------------------------------------------------------------ Focus trap */

  var FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function trapFocus(container, initial) {
    /* Recomputed on every Tab: a drawer's contents change while it is open. */
    function focusables() {
      return $$(FOCUSABLE, container).filter(function (el) {
        return el.offsetParent !== null || el === document.activeElement;
      });
    }

    (initial || focusables()[0] || container).focus({ preventScroll: true });

    function handler(event) {
      if (event.key !== 'Tab') return;

      var items = focusables();
      if (!items.length) return;

      var first = items[0];
      var last = items[items.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    container.addEventListener('keydown', handler);
    return function release() {
      container.removeEventListener('keydown', handler);
    };
  }

  /* -------------------------------------------------------- Scroll locking */

  var scrollLocks = 0;
  var savedScrollY = 0;

  function lockScroll() {
    if (scrollLocks === 0) {
      savedScrollY = window.scrollY;
      document.body.style.top = '-' + savedScrollY + 'px';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
    }
    scrollLocks += 1;
  }

  function unlockScroll() {
    scrollLocks = Math.max(0, scrollLocks - 1);
    if (scrollLocks === 0) {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      window.scrollTo(0, savedScrollY);
    }
  }

  /* --------------------------------------------------------------- Drawers */

  var openPanels = [];

  function getOverlay() {
    var overlay = $('[data-overlay]');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'overlay';
      overlay.setAttribute('data-overlay', '');
      document.body.appendChild(overlay);
    }
    return overlay;
  }

  function openPanel(panel, trigger) {
    if (!panel || panel.classList.contains('is-open')) return;

    panel.classList.add('is-open');
    panel.removeAttribute('aria-hidden');
    getOverlay().classList.add('is-active');
    lockScroll();

    var release = trapFocus(panel, $('[data-panel-initial-focus]', panel));
    openPanels.push({ panel: panel, trigger: trigger || document.activeElement, release: release });

    panel.dispatchEvent(new CustomEvent('panel:open', { bubbles: true }));
  }

  function closePanel(specific) {
    var entry;
    if (specific) {
      var index = openPanels.findIndex(function (item) {
        return item.panel === specific;
      });
      if (index === -1) return;
      entry = openPanels.splice(index, 1)[0];
    } else {
      entry = openPanels.pop();
    }
    if (!entry) return;

    entry.panel.classList.remove('is-open');
    entry.panel.setAttribute('aria-hidden', 'true');
    entry.release();
    unlockScroll();

    if (!openPanels.length) getOverlay().classList.remove('is-active');

    if (entry.trigger && document.body.contains(entry.trigger)) {
      entry.trigger.focus({ preventScroll: true });
    }

    entry.panel.dispatchEvent(new CustomEvent('panel:close', { bubbles: true }));
  }

  Floreve.openPanel = openPanel;
  Floreve.closePanel = closePanel;

  document.addEventListener('click', function (event) {
    if (event.target.matches('[data-overlay]')) {
      closePanel();
      return;
    }

    var opener = event.target.closest('[data-panel-open]');
    if (opener) {
      var target = document.getElementById(opener.getAttribute('data-panel-open'));
      if (target) {
        event.preventDefault();
        openPanel(target, opener);
      }
      return;
    }

    var closer = event.target.closest('[data-panel-close]');
    if (closer) {
      event.preventDefault();
      closePanel(closer.closest('.drawer, .search-panel, .lightbox'));
    }
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && openPanels.length) {
      event.stopPropagation();
      closePanel();
    }
  });

  /* ----------------------------------------------------------------- Toast */

  var toastTimer;

  function showToast(message) {
    var toast = $('[data-toast]');
    if (!toast) return;
    $('[data-toast-message]', toast).textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.classList.remove('is-visible');
    }, 3200);
  }

  Floreve.showToast = showToast;

  /* ------------------------------------------------------ Reveal on scroll */

  function initReveal(scope) {
    var targets = $$('.reveal:not(.is-visible)', scope || document);
    if (!targets.length) return;

    var settings = Floreve.settings || {};
    if (settings.enableReveal === false || prefersReducedMotion() || !('IntersectionObserver' in window)) {
      targets.forEach(function (el) {
        el.classList.add('is-visible');
      });
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.05 }
    );

    targets.forEach(function (el) {
      observer.observe(el);
    });
  }

  /* ---------------------------------------------------------------- Header */

  function initHeader() {
    var wrapper = $('[data-header]');
    if (!wrapper) return;

    var root = document.documentElement;

    /*
     * --header-height is the header's own size; --header-offset is how much of
     * the viewport it permanently occupies, which is what sticky elements
     * further down the page need to clear. They differ when the header scrolls
     * away with the page.
     */
    function measure() {
      var header = $('.header', wrapper);
      if (!header) return;
      var height = header.offsetHeight;
      var pinned =
        wrapper.classList.contains('header-wrapper--sticky') || wrapper.classList.contains('header-wrapper--overlay');

      root.style.setProperty('--header-height', height + 'px');
      root.style.setProperty('--header-offset', (pinned ? height : 0) + 'px');
    }

    measure();
    window.addEventListener('resize', debounce(measure, 200));

    if (!wrapper.classList.contains('header-wrapper--overlay')) return;

    var threshold = 80;
    var solid = false;

    function onScroll() {
      var shouldBeSolid = window.scrollY > threshold;
      if (shouldBeSolid === solid) return;
      solid = shouldBeSolid;
      wrapper.classList.toggle('is-solid', solid);
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ---------------------------------------------------- Announcement bar */

  function initAnnouncement(scope) {
    $$('[data-announcement]', scope || document).forEach(function (bar) {
      if (bar.dataset.rotating === 'true') return;

      var slides = $$('.announcement__slide', bar);
      if (slides.length < 2) return;

      bar.dataset.rotating = 'true';

      var interval = parseInt(bar.getAttribute('data-interval'), 10) || 6000;
      var index = 0;

      setInterval(function () {
        slides[index].classList.remove('is-active');
        index = (index + 1) % slides.length;
        slides[index].classList.add('is-active');
      }, interval);
    });
  }

  /* -------------------------------------------------------------- Quantity */

  document.addEventListener('click', function (event) {
    var button = event.target.closest('[data-quantity-change]');
    if (!button) return;

    var wrapper = button.closest('.quantity');
    var input = $('input', wrapper);
    if (!input) return;

    var step = button.getAttribute('data-quantity-change') === 'up' ? 1 : -1;
    var min = parseInt(input.getAttribute('min'), 10);
    var max = parseInt(input.getAttribute('max'), 10);
    var next = (parseInt(input.value, 10) || 0) + step;

    if (!isNaN(min)) next = Math.max(min, next);
    if (!isNaN(max)) next = Math.min(max, next);

    if (String(next) === input.value) return;
    input.value = next;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });

  /* ------------------------------------------------------------------ Cart */

  var Cart = {
    /** Refresh every cart-bound region from the Section Rendering API. */
    render: function (sections) {
      if (sections) {
        Object.keys(sections).forEach(function (id) {
          var html = sections[id];
          if (!html) return;
          var parsed = new DOMParser().parseFromString(html, 'text/html');
          $$('[data-cart-section="' + id + '"]').forEach(function (target) {
            var source = parsed.querySelector('[data-cart-section="' + id + '"]');
            if (source) {
              target.innerHTML = source.innerHTML;
              initReveal(target);
            }
          });
        });
      }
      return fetchJSON(routes.cart + '.js').then(Cart.updateCount);
    },

    updateCount: function (cart) {
      var count = cart.item_count;
      $$('[data-cart-count]').forEach(function (el) {
        el.textContent = count;
        el.hidden = count === 0;
      });
      $$('[data-cart-count-label]').forEach(function (el) {
        el.textContent = count === 1 ? strings.cartCountOne : (strings.cartCountOther || '').replace('[count]', count);
      });
      document.dispatchEvent(new CustomEvent('cart:updated', { detail: { cart: cart } }));
      return cart;
    },

    sectionsToRender: function () {
      return $$('[data-cart-section]')
        .map(function (el) {
          return el.getAttribute('data-cart-section');
        })
        .filter(function (value, index, all) {
          return all.indexOf(value) === index;
        })
        .join(',');
    },

    add: function (formData) {
      var sections = Cart.sectionsToRender();
      if (sections) formData.append('sections', sections);

      return fetchJSON(routes.cart_add + '.js', {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: formData
      }).then(function (data) {
        return Cart.render(data.sections).then(function () {
          return data;
        });
      });
    },

    change: function (payload) {
      payload.sections = Cart.sectionsToRender();
      return fetchJSON(routes.cart_change + '.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload)
      }).then(function (cart) {
        return Cart.render(cart.sections).then(function () {
          return cart;
        });
      });
    }
  };

  Floreve.Cart = Cart;

  /* Add to bag — product forms and quick add share one handler. */
  document.addEventListener('submit', function (event) {
    var form = event.target.closest('form.js-product-form');
    if (!form) return;

    event.preventDefault();

    var button = $('[data-add-to-cart]', form);
    var label = button ? $('.btn__label', button) : null;
    var previous = label ? label.textContent : '';
    var errorTarget = $('[data-form-error]', form);

    if (button) {
      button.setAttribute('aria-busy', 'true');
      button.disabled = true;
      if (label) label.textContent = strings.adding || 'Adding';
    }
    if (errorTarget) {
      errorTarget.hidden = true;
      errorTarget.textContent = '';
    }

    Cart.add(new FormData(form))
      .then(function () {
        if (label) label.textContent = strings.added || 'Added';
        var drawer = (Floreve.settings || {}).cartType === 'drawer' ? document.getElementById('cart-drawer') : null;
        if (drawer) openPanel(drawer, button);
        else showToast(strings.added || 'Added to your bag');
      })
      .catch(function (error) {
        var message = (error.data && error.data.description) || error.message;
        if (errorTarget) {
          errorTarget.textContent = message;
          errorTarget.hidden = false;
        } else {
          showToast(message);
        }
      })
      .finally(function () {
        setTimeout(function () {
          if (!button) return;
          button.removeAttribute('aria-busy');
          button.disabled = false;
          if (label) label.textContent = previous;
        }, 900);
      });
  });

  /* Quantity changes and removals inside the bag */
  document.addEventListener('change', function (event) {
    var input = event.target.closest('[data-cart-quantity]');
    if (!input) return;

    var item = input.closest('[data-cart-item]');
    if (item) item.classList.add('is-updating');

    Cart.change({
      line: parseInt(input.getAttribute('data-line'), 10),
      quantity: parseInt(input.value, 10)
    }).catch(function (error) {
      showToast(error.message);
      if (item) item.classList.remove('is-updating');
    });
  });

  document.addEventListener('click', function (event) {
    var remove = event.target.closest('[data-cart-remove]');
    if (!remove) return;
    event.preventDefault();

    var item = remove.closest('[data-cart-item]');
    if (item) item.classList.add('is-updating');

    Cart.change({ line: parseInt(remove.getAttribute('data-line'), 10), quantity: 0 }).catch(function (error) {
      showToast(error.message);
      if (item) item.classList.remove('is-updating');
    });
  });

  /* Order note */
  document.addEventListener(
    'change',
    debounce(function (event) {
      var note = event.target.closest('[data-cart-note]');
      if (!note) return;
      fetch(routes.cart_update + '.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: note.value })
      });
    }, 500)
  );

  /* ----------------------------------------------------------------- Share */

  document.addEventListener('click', function (event) {
    var link = event.target.closest('[data-share-link]');
    if (!link) return;

    var url = link.href;

    if (navigator.share) {
      event.preventDefault();
      navigator.share({ url: url, title: document.title }).catch(function () {});
      return;
    }

    if (navigator.clipboard) {
      event.preventDefault();
      navigator.clipboard.writeText(url).then(function () {
        showToast(strings.linkCopied || 'Link copied');
      });
    }
    /* Without either API the link stays a plain, working link. */
  });

  /* -------------------------------------------------------- Variant picker */

  function VariantPicker(root) {
    this.root = root;
    this.productId = root.getAttribute('data-product-id');
    this.sectionId = root.getAttribute('data-section-id');
    this.url = root.getAttribute('data-product-url');
    this.updateUrl = root.getAttribute('data-update-url') !== 'false';

    var data = $('[data-variant-data]', root);
    try {
      this.variants = JSON.parse(data.textContent);
    } catch (error) {
      this.variants = [];
    }

    this.inputs = $$('input[data-option-index]', root);
    this.onChange = this.onChange.bind(this);
    root.addEventListener('change', this.onChange);
    this.markUnavailable();
  }

  VariantPicker.prototype.selectedOptions = function () {
    var values = [];
    this.inputs.forEach(function (input) {
      if (input.checked) values[parseInt(input.getAttribute('data-option-index'), 10)] = input.value;
    });
    return values;
  };

  VariantPicker.prototype.match = function (options) {
    return (
      this.variants.find(function (variant) {
        return variant.options.every(function (value, index) {
          return options[index] === undefined || options[index] === value;
        });
      }) || null
    );
  };

  /* Cross out combinations that do not exist so nothing is a dead end. */
  VariantPicker.prototype.markUnavailable = function () {
    var selected = this.selectedOptions();
    var variants = this.variants;

    this.inputs.forEach(function (input) {
      var index = parseInt(input.getAttribute('data-option-index'), 10);
      var probe = selected.slice();
      probe[index] = input.value;

      var available = variants.some(function (variant) {
        return (
          variant.available &&
          variant.options.every(function (value, i) {
            return i === index ? value === input.value : probe[i] === undefined || probe[i] === value;
          })
        );
      });

      var label = input.nextElementSibling;
      if (label) label.classList.toggle('is-unavailable', !available);
    });
  };

  VariantPicker.prototype.onChange = function (event) {
    if (!event.target.matches('input[data-option-index]')) return;

    var variant = this.match(this.selectedOptions());
    this.markUnavailable();
    this.updateSelectedLabels();

    if (!variant) {
      this.setUnavailable();
      return;
    }

    if (this.updateUrl && window.history.replaceState) {
      window.history.replaceState({}, '', this.url + '?variant=' + variant.id);
    }

    this.updateId(variant);
    this.updatePrice(variant);
    this.updateAvailability(variant);
    this.updateMedia(variant);
    this.updateMeta(variant);

    document.dispatchEvent(new CustomEvent('variant:change', { detail: { variant: variant, sectionId: this.sectionId } }));
  };

  VariantPicker.prototype.updateSelectedLabels = function () {
    this.inputs.forEach(function (input) {
      if (!input.checked) return;
      var group = input.closest('[data-option-group]');
      var display = group ? $('[data-option-selected]', group) : null;
      if (display) display.textContent = input.value;
    });
  };

  VariantPicker.prototype.scope = function (selector) {
    return $$(selector + '[data-section-id="' + this.sectionId + '"]');
  };

  VariantPicker.prototype.updateId = function (variant) {
    this.scope('[data-variant-id]').forEach(function (input) {
      input.value = variant.id;
    });
  };

  VariantPicker.prototype.updatePrice = function (variant) {
    this.scope('[data-price-block]').forEach(function (block) {
      var now = $('[data-price-now]', block);
      var was = $('[data-price-was]', block);
      var from = $('[data-price-from]', block);
      var onSale = variant.compare_at_price && variant.compare_at_price > variant.price;

      if (now) {
        now.textContent = formatMoney(variant.price);
        now.classList.toggle('price__now--sale', !!onSale);
      }
      if (was) {
        was.textContent = onSale ? formatMoney(variant.compare_at_price) : '';
        was.hidden = !onSale;
      }
      if (from) from.hidden = true;

      var unit = $('[data-price-unit]', block);
      if (unit) {
        if (variant.unit_price) {
          unit.textContent = formatMoney(variant.unit_price) + ' / ' + (variant.unit_price_measurement && variant.unit_price_measurement.reference_unit);
          unit.hidden = false;
        } else {
          unit.hidden = true;
        }
      }
    });

    $$('[data-buy-bar-price]').forEach(function (el) {
      el.textContent = formatMoney(variant.price);
    });
  };

  VariantPicker.prototype.updateAvailability = function (variant) {
    var soldOut = strings.soldOut || 'Sold out';
    var addToCart = strings.addToCart || 'Add to bag';

    this.scope('[data-add-to-cart]').forEach(function (button) {
      var label = $('.btn__label', button);
      button.disabled = !variant.available;
      if (label) label.textContent = variant.available ? addToCart : soldOut;
    });

    this.scope('[data-dynamic-checkout]').forEach(function (el) {
      el.hidden = !variant.available;
    });

    var inventory = variant.inventory;
    this.scope('[data-inventory]').forEach(function (el) {
      if (!inventory || !inventory.status) {
        el.hidden = true;
        return;
      }

      var text = '';
      switch (inventory.status) {
        case 'in_stock':
          text = strings.inventoryInStock;
          break;
        case 'low':
          text =
            inventory.count > 0
              ? (strings.inventoryLow || '').replace('[count]', inventory.count)
              : strings.inventoryInStock;
          break;
        case 'backorder':
          text = strings.inventoryBackorder;
          break;
        default:
          text = strings.inventoryOut;
      }

      el.className = 'product__inventory product__inventory--' + inventory.status;
      var label = $('[data-inventory-text]', el);
      if (label) label.textContent = text;
      el.hidden = !text;
    });
  };

  VariantPicker.prototype.updateMeta = function (variant) {
    this.scope('[data-variant-sku]').forEach(function (el) {
      el.textContent = variant.sku || '';
      el.hidden = !variant.sku;
    });
  };

  VariantPicker.prototype.updateMedia = function (variant) {
    if (!variant.featured_media) return;
    var gallery = $('[data-gallery][data-section-id="' + this.sectionId + '"]');
    if (gallery && gallery.floreveGallery) gallery.floreveGallery.goToMedia(variant.featured_media.id);
  };

  VariantPicker.prototype.setUnavailable = function () {
    var unavailable = strings.unavailable || 'Unavailable';
    this.scope('[data-add-to-cart]').forEach(function (button) {
      var label = $('.btn__label', button);
      button.disabled = true;
      if (label) label.textContent = unavailable;
    });
  };

  /* ------------------------------------------------------- Product gallery */

  function Gallery(root) {
    this.root = root;
    this.slidesEl = $('[data-gallery-slides]', root);
    this.slides = $$('[data-gallery-slide]', root);
    this.thumbs = $$('[data-gallery-thumb]', root);
    this.dots = $$('[data-gallery-dot]', root);
    this.index = 0;

    root.floreveGallery = this;

    var self = this;

    this.thumbs.concat(this.dots).forEach(function (control) {
      on(control, 'click', function () {
        self.goTo(parseInt(control.getAttribute('data-index'), 10));
      });
    });

    if (this.slidesEl) {
      on(
        this.slidesEl,
        'scroll',
        debounce(function () {
          var width = self.slidesEl.clientWidth;
          if (!width) return;
          self.setActive(Math.round(self.slidesEl.scrollLeft / width));
        }, 90),
        { passive: true }
      );
    }

    /* Lightbox */
    var lightbox = $('[data-lightbox]');
    $$('[data-gallery-open]', root).forEach(function (trigger) {
      on(trigger, 'click', function () {
        if (!lightbox) return;
        var body = $('[data-lightbox-body]', lightbox);
        body.innerHTML = '';
        self.slides.forEach(function (slide) {
          var img = $('img', slide);
          if (!img) return;
          var clone = document.createElement('img');
          clone.src = img.getAttribute('data-full') || img.currentSrc || img.src;
          clone.alt = img.alt;
          clone.loading = 'lazy';
          body.appendChild(clone);
        });
        openPanel(lightbox, trigger);
        var target = body.children[self.index];
        if (target) target.scrollIntoView({ block: 'start' });
      });
    });
  }

  Gallery.prototype.setActive = function (index) {
    if (index === this.index || index < 0 || index >= this.slides.length) return;
    this.index = index;
    this.thumbs.forEach(function (thumb, i) {
      thumb.setAttribute('aria-current', i === index ? 'true' : 'false');
    });
    this.dots.forEach(function (dot, i) {
      dot.setAttribute('aria-current', i === index ? 'true' : 'false');
    });
  };

  Gallery.prototype.goTo = function (index) {
    if (!this.slidesEl || index < 0 || index >= this.slides.length) return;
    var behavior = prefersReducedMotion() ? 'auto' : 'smooth';

    /* The stacked desktop layout has no horizontal overflow to scroll. */
    if (this.slidesEl.scrollWidth > this.slidesEl.clientWidth + 4) {
      this.slidesEl.scrollTo({ left: this.slidesEl.clientWidth * index, behavior: behavior });
    } else {
      this.slides[index].scrollIntoView({ behavior: behavior, block: 'nearest' });
    }

    this.setActive(index);
  };

  Gallery.prototype.goToMedia = function (mediaId) {
    var index = this.slides.findIndex(function (slide) {
      return slide.getAttribute('data-media-id') === String(mediaId);
    });
    if (index > -1) this.goTo(index);
  };

  /* --------------------------------------------------------- Sticky buy bar */

  function initBuyBar(scope) {
    var bar = $('[data-buy-bar]', scope || document);
    var sentinel = $('[data-buy-bar-sentinel]', scope || document);
    if (!bar || !sentinel || !('IntersectionObserver' in window)) return;

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          bar.classList.toggle('is-visible', !entry.isIntersecting && entry.boundingClientRect.top < 0);
        });
      },
      { threshold: 0 }
    );

    observer.observe(sentinel);
  }

  /* ------------------------------------------------------- Recommendations */

  function initRecommendations(scope) {
    $$('[data-recommendations]', scope || document).forEach(function (container) {
      var url = container.getAttribute('data-url');
      if (!url || container.dataset.loaded === 'true') return;

      function load() {
        container.dataset.loaded = 'true';
        fetch(url)
          .then(function (response) {
            return response.text();
          })
          .then(function (text) {
            var parsed = new DOMParser().parseFromString(text, 'text/html');
            var source = parsed.querySelector('[data-recommendations]');
            if (!source || !source.innerHTML.trim()) return;
            container.innerHTML = source.innerHTML;
            initReveal(container);
          })
          .catch(function () {
            /* Recommendations are an enhancement — failing quietly is correct. */
          });
      }

      if (!('IntersectionObserver' in window)) {
        load();
        return;
      }

      var observer = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            observer.disconnect();
            load();
          });
        },
        { rootMargin: '400px 0px' }
      );

      observer.observe(container);
    });
  }

  /* ----------------------------------------------------- Predictive search */

  function initSearch() {
    var panel = $('[data-search-panel]');
    if (!panel || panel.dataset.bound === 'true') return;
    panel.dataset.bound = 'true';

    var input = $('[data-search-input]', panel);
    var results = $('[data-search-results]', panel);
    var defaults = $('[data-search-default]', panel);
    var clear = $('[data-search-clear]', panel);
    var controller;

    if (clear) {
      on(clear, 'click', function () {
        input.value = '';
        input.focus();
        render('');
      });
    }

    function render(html) {
      results.innerHTML = html;
      results.hidden = !html;
      if (defaults) defaults.hidden = !!html;
      if (clear) clear.hidden = !input.value;
    }

    if (!panel.hasAttribute('data-predictive')) return;

    var search = debounce(function () {
      var term = input.value.trim();
      if (term.length < 2) {
        render('');
        return;
      }

      if (controller) controller.abort();
      controller = new AbortController();

      var resources = panel.getAttribute('data-resources') || 'product';
      var url =
        routes.predictive_search +
        '?q=' +
        encodeURIComponent(term) +
        '&resources[type]=' +
        resources +
        '&resources[limit]=5&section_id=predictive-search';

      fetch(url, { signal: controller.signal })
        .then(function (response) {
          return response.text();
        })
        .then(function (text) {
          var parsed = new DOMParser().parseFromString(text, 'text/html');
          var content = parsed.querySelector('[data-predictive-results]');
          render(content ? content.innerHTML : '');
        })
        .catch(function (error) {
          if (error.name !== 'AbortError') render('');
        });
    }, 220);

    on(input, 'input', search);

    on(panel, 'panel:open', function () {
      if (clear) clear.hidden = !input.value;
    });
  }

  /* ---------------------------------------------------------------- Facets */

  var facetRenderFrom = null;

  function initFacets(scope) {
    var form = $('[data-facet-form]', scope || document);
    if (!form || form.dataset.bound === 'true') return;

    var target = $('[data-collection-results]');
    if (!target) return;

    form.dataset.bound = 'true';
    var bar = $('[data-loading-bar]');

    function renderFrom(url, push) {
      if (bar) bar.classList.add('is-loading');

      fetch(url)
        .then(function (response) {
          return response.text();
        })
        .then(function (text) {
          var parsed = new DOMParser().parseFromString(text, 'text/html');

          ['[data-collection-results]', '[data-facet-panel]', '[data-collection-count]', '[data-facet-active]'].forEach(
            function (selector) {
              var next = parsed.querySelector(selector);
              var current = $(selector);
              if (next && current) current.innerHTML = next.innerHTML;
            }
          );

          if (push) window.history.pushState({ url: url }, '', url);
          initReveal($('[data-collection-results]'));

          var heading = $('[data-collection-results]');
          if (heading) heading.setAttribute('aria-busy', 'false');
        })
        .finally(function () {
          if (bar) bar.classList.remove('is-loading');
        });
    }

    facetRenderFrom = renderFrom;

    on(
      form,
      'change',
      debounce(function () {
        renderFrom(form.action + '?' + new URLSearchParams(new FormData(form)).toString(), true);
      }, 250)
    );

    on(form, 'submit', function (event) {
      event.preventDefault();
      renderFrom(form.action + '?' + new URLSearchParams(new FormData(form)).toString(), true);
    });

  }

  /* Filter pills and pagination are re-rendered constantly, so they are handled
     by delegation from the document rather than re-bound each time. */
  document.addEventListener('click', function (event) {
    if (!facetRenderFrom) return;

    var link = event.target.closest('[data-facet-remove], [data-pagination-link]');
    if (!link) return;

    event.preventDefault();
    facetRenderFrom(link.href, true);

    if (link.hasAttribute('data-pagination-link')) {
      var results = $('[data-collection-results]');
      if (results) results.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
    }
  });

  window.addEventListener('popstate', function () {
    if (facetRenderFrom) facetRenderFrom(window.location.href, false);
  });

  /* --------------------------------------------------------- Link prefetch */

  /*
   * Warms the cache for a page the visitor is clearly about to open. Pointing
   * at a link or starting a tap is a strong signal, and by the time the click
   * lands the document is usually already in flight. Same-origin GET pages
   * only — never the cart or account, which must not be fetched speculatively.
   */
  function initPrefetch() {
    if (navigator.connection && navigator.connection.saveData) return;

    try {
      if (!document.createElement('link').relList.supports('prefetch')) return;
    } catch (error) {
      return;
    }

    var prefetched = {};
    var skip = /\/(cart|checkout|account)(\/|$|\?)/;

    function prefetch(url) {
      if (!url || prefetched[url]) return;
      prefetched[url] = true;
      var link = document.createElement('link');
      link.rel = 'prefetch';
      link.href = url;
      document.head.appendChild(link);
    }

    function candidate(event) {
      var anchor = event.target.closest('a[href]');
      if (!anchor) return;
      if (anchor.origin !== window.location.origin) return;
      if (anchor.hasAttribute('download') || anchor.target === '_blank') return;
      if (anchor.pathname === window.location.pathname) return;
      if (skip.test(anchor.pathname)) return;
      prefetch(anchor.href);
    }

    var timer;
    document.addEventListener(
      'mouseover',
      function (event) {
        clearTimeout(timer);
        timer = setTimeout(function () {
          candidate(event);
        }, 65);
      },
      { passive: true, capture: true }
    );

    document.addEventListener('mouseout', function () {
      clearTimeout(timer);
    });

    document.addEventListener('touchstart', candidate, { passive: true, capture: true });
  }

  /* ------------------------------------------------- Country and province */

  function initAddressFields(scope) {
    $$('[data-country-select]', scope || document).forEach(function (select) {
      if (select.dataset.bound === 'true') return;
      select.dataset.bound = 'true';

      var wrapper = document.getElementById(select.getAttribute('data-province-target'));
      if (!wrapper) return;
      var provinceSelect = $('[data-province-select]', wrapper);

      function sync() {
        var option = select.options[select.selectedIndex];
        var raw = option ? option.getAttribute('data-provinces') : null;
        var provinces = [];

        try {
          provinces = raw ? JSON.parse(raw) : [];
        } catch (error) {
          provinces = [];
        }

        provinceSelect.innerHTML = '';

        if (!provinces.length) {
          wrapper.hidden = true;
          return;
        }

        var preferred = provinceSelect.getAttribute('data-default');
        provinces.forEach(function (pair) {
          var opt = document.createElement('option');
          opt.value = pair[0];
          opt.textContent = pair[1];
          if (preferred && preferred === pair[0]) opt.selected = true;
          provinceSelect.appendChild(opt);
        });

        wrapper.hidden = false;
      }

      var defaultCountry = select.getAttribute('data-default');
      if (defaultCountry) select.value = defaultCountry;

      on(select, 'change', sync);
      sync();
    });
  }

  /* Confirm before anything destructive */
  document.addEventListener('click', function (event) {
    var button = event.target.closest('[data-confirm]');
    if (!button) return;
    if (!window.confirm(button.getAttribute('data-confirm'))) event.preventDefault();
  });

  /* ---------------------------------------------------- Background video */

  /*
   * A looping hero video is the heaviest thing on the page, so it is never in
   * the markup as autoplay. It loads only when the screen is big enough to
   * warrant it, motion is welcome, and the visitor is not on Data Saver.
   * Everyone else keeps the poster image and pays nothing.
   */
  function initLazyVideo(scope) {
    var videos = $$('[data-lazy-video]', scope || document);
    if (!videos.length) return;

    var saveData = navigator.connection && navigator.connection.saveData;
    var narrow = window.matchMedia('(max-width: 749px)').matches;

    if (saveData || narrow || prefersReducedMotion()) return;

    videos.forEach(function (video) {
      if (video.dataset.started === 'true') return;

      function start() {
        video.dataset.started = 'true';
        var src = video.getAttribute('data-src');
        if (!src) return;
        video.src = src;
        video.load();
        var attempt = video.play();
        if (attempt && attempt.catch) attempt.catch(function () {});
      }

      if (!('IntersectionObserver' in window)) {
        start();
        return;
      }

      var observer = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            observer.disconnect();
            start();
          });
        },
        { rootMargin: '200px' }
      );

      observer.observe(video);
    });
  }

  /* ------------------------------------------------------- Section booting */

  function initSection(scope) {
    initReveal(scope);
    initAnnouncement(scope);
    initBuyBar(scope);
    initFacets(scope);
    initRecommendations(scope);
    initAddressFields(scope);
    initLazyVideo(scope);

    $$('[data-variant-picker]', scope).forEach(function (el) {
      if (!el.floreveVariantPicker) el.floreveVariantPicker = new VariantPicker(el);
    });

    $$('[data-gallery]', scope).forEach(function (el) {
      if (!el.floreveGallery) new Gallery(el);
    });
  }

  function init() {
    initHeader();
    initSearch();
    initPrefetch();
    initSection(document);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* Theme editor lifecycle */
  document.addEventListener('shopify:section:load', function (event) {
    initSection(event.target);
    initHeader();
    initSearch();
  });

  document.addEventListener('shopify:section:select', function (event) {
    var panel = event.target.querySelector('.drawer, .search-panel');
    if (panel) openPanel(panel);
  });

  document.addEventListener('shopify:section:deselect', function (event) {
    var panel = event.target.querySelector('.drawer, .search-panel');
    if (panel) closePanel(panel);
  });
})();
