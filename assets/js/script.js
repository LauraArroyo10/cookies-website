/* ==========================================================================
   Yayis — script.js (vanilla JS, no dependencies)
   - Scrolling marquee
   - Pre-order / order dialog
   - Contact + newsletter forms with validation
   - Nav highlight on scroll, reveal-on-scroll, image placeholders
   ========================================================================== */

(() => {
  'use strict';

  /* ------------------------------------------------------------------
     CONFIG
     Forms always keep a local copy in localStorage. To also send the data
     to a real service (Formspree, Getform, your own API...), put its URL
     here. The data is POSTed as JSON.
     ------------------------------------------------------------------ */
  const FORM_ENDPOINT = '';

  const PRODUCTS = {
    'honey-cream': {
      name: 'Honey and cream',
      desc: 'A delicious blend of honey and cream, balancing sweetness and smoothness. An artisanal cookie for anyone who enjoys delicate, comforting flavors.'
    },
    'choco-coffee': {
      name: 'Choco coffee',
      desc: 'Rich chocolate meets distinctive coffee notes in a cookie with a deep flavor and irresistible texture. A perfect combination for chocolate and coffee lovers.'
    },
    'vanilla-caramel': {
      name: 'Vanilla Caramel',
      desc: 'The smoothness of vanilla meets the sweetness of caramel for a warm, creamy, and delicious treat. A classic reinvented in every bite.'
    },
    'coffee-flour': {
      name: 'Coffee Pulp Flour (1 kg)',
      desc: 'A plant-based ingredient containing dietary fiber and naturally occurring bioactive compounds. Ideal for cookies, cakes, breads, and pancakes.'
    }
  };

  const MSG = {
    required: 'This field is required.',
    email: 'Please enter a valid e-mail.',
    quantity: 'Choose a quantity between 1 and 24.',
    sending: 'Sending…',
    error: 'Something went wrong. Please try again.',
    subscribed: 'Thanks! You are on the list.',
    contactSent: 'Thanks for your message!',
    preorderDone: (name) => `Thank you, ${name}! Your order has been registered.`
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function debounce(fn, ms) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  /* ------------------------------------------------------------------
     Validation + submission
     ------------------------------------------------------------------ */
  const validators = {
    required: (v) => v.trim() !== '' || MSG.required,
    email: (v) => v.trim() === '' || EMAIL_RE.test(v.trim()) || MSG.email,
    quantity: (v) => {
      const n = Number(v);
      return (Number.isInteger(n) && n >= 1 && n <= 24) || MSG.quantity;
    }
  };

  let idCounter = 0;

  function validateInput(input) {
    const rules = (input.dataset.validate || '').split(/\s+/).filter(Boolean);
    let error = '';
    for (const rule of rules) {
      const result = validators[rule](input.value);
      if (result !== true) {
        error = result;
        break;
      }
    }
    const holder = input.closest('[data-field]');
    const errorEl = holder && $('.field-error', holder);
    if (errorEl) {
      if (!errorEl.id) errorEl.id = `err-${++idCounter}`;
      input.setAttribute('aria-describedby', errorEl.id);
      errorEl.textContent = error;
    }
    input.setAttribute('aria-invalid', error ? 'true' : 'false');
    return !error;
  }

  function setStatus(form, text, state) {
    const el = $('.form-status', form);
    if (!el) return;
    el.textContent = text || '';
    el.dataset.state = state || '';
  }

  async function submitData(type, data) {
    const record = { type, ...data, createdAt: new Date().toISOString() };

    try {
      const key = `yayis_${type}`;
      const list = JSON.parse(localStorage.getItem(key) || '[]');
      list.push(record);
      localStorage.setItem(key, JSON.stringify(list));
    } catch (_) {
      /* storage can be unavailable (private mode); ignore */
    }

    if (FORM_ENDPOINT) {
      const response = await fetch(FORM_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(record)
      });
      if (!response.ok) throw new Error(`Request failed (${response.status})`);
    }
  }

  function wireForm(form, { type, onSuccess }) {
    form.noValidate = true;
    const inputs = $$('[data-validate]', form);

    inputs.forEach((input) => {
      input.addEventListener('input', () => {
        if (input.getAttribute('aria-invalid') === 'true') validateInput(input);
      });
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      setStatus(form, '');

      const invalid = inputs.filter((input) => !validateInput(input));
      if (invalid.length) {
        invalid[0].focus();
        return;
      }

      const data = Object.fromEntries(new FormData(form).entries());
      const button = $('[type="submit"]', form);
      const label = button.textContent;
      button.disabled = true;
      button.textContent = MSG.sending;

      try {
        await submitData(type, data);
        onSuccess(data);
      } catch (_) {
        setStatus(form, MSG.error, 'error');
      } finally {
        button.disabled = false;
        button.textContent = label;
      }
    });
  }

  /* ------------------------------------------------------------------
     Forms: newsletter (footer) + contact
     ------------------------------------------------------------------ */
  function initForms() {
    $$('form[data-form="subscribe"]').forEach((form) => {
      wireForm(form, {
        type: 'subscribe',
        onSuccess: () => {
          form.reset();
          inputsReset(form);
          setStatus(form, MSG.subscribed, 'ok');
        }
      });
    });

    const contact = $('form[data-form="contact"]');
    if (contact) {
      const textarea = $('textarea', contact);
      const autosize = () => {
        textarea.style.height = 'auto';
        textarea.style.height = `${textarea.scrollHeight}px`;
      };
      textarea.addEventListener('input', autosize);

      wireForm(contact, {
        type: 'contact',
        onSuccess: () => {
          contact.reset();
          inputsReset(contact);
          autosize();
          setStatus(contact, MSG.contactSent, 'ok');
        }
      });
    }
  }

  function inputsReset(form) {
    $$('[data-validate]', form).forEach((input) => input.removeAttribute('aria-invalid'));
    $$('.field-error', form).forEach((el) => (el.textContent = ''));
  }

  /* ------------------------------------------------------------------
     Pre-order / order dialog
     ------------------------------------------------------------------ */
  function initOrderDialog() {
    const triggers = $$('[data-preorder]');
    if (!triggers.length) return;

    const options = Object.entries(PRODUCTS)
      .map(([key, p]) => `<option value="${key}">${p.name}</option>`)
      .join('');

    const dialog = document.createElement('dialog');
    dialog.className = 'modal';
    dialog.setAttribute('aria-labelledby', 'order-title');
    dialog.innerHTML = `
      <div class="modal__inner">
        <button type="button" class="modal__close" aria-label="Close">&times;</button>
        <h2 id="order-title">Pre-order</h2>

        <form novalidate>
          <div class="field" data-field>
            <label for="order-product">Product</label>
            <select id="order-product" name="product" data-validate="required">
              <option value="">Choose one…</option>
              ${options}
            </select>
            <span class="field-error"></span>
          </div>
          <p class="modal__desc" aria-live="polite"></p>

          <div class="field" data-field>
            <label for="order-name">Name</label>
            <input id="order-name" name="name" type="text" autocomplete="name" data-validate="required">
            <span class="field-error"></span>
          </div>

          <div class="field" data-field>
            <label for="order-email">E-mail</label>
            <input id="order-email" name="email" type="email" autocomplete="email" data-validate="required email">
            <span class="field-error"></span>
          </div>

          <div class="field" data-field>
            <label for="order-qty">Quantity</label>
            <input id="order-qty" name="quantity" type="number" min="1" max="24" value="1" inputmode="numeric" data-validate="required quantity">
            <span class="field-error"></span>
          </div>

          <button type="submit" class="btn btn--brown btn--small">Send</button>
          <p class="form-status" role="status" aria-live="polite"></p>
        </form>

        <div class="modal__done" hidden>
          <p></p>
          <button type="button" class="btn btn--brown btn--small" data-close>Close</button>
        </div>
      </div>`;
    document.body.append(dialog);

    const form = $('form', dialog);
    const select = $('#order-product', dialog);
    const desc = $('.modal__desc', dialog);
    const title = $('#order-title', dialog);
    const done = $('.modal__done', dialog);

    const showDesc = () => {
      desc.textContent = PRODUCTS[select.value]?.desc || '';
    };
    select.addEventListener('change', showDesc);

    const open = (productKey, heading) => {
      form.reset();
      inputsReset(form);
      setStatus(form, '');
      form.hidden = false;
      done.hidden = true;
      title.textContent = heading;
      select.value = PRODUCTS[productKey] ? productKey : '';
      showDesc();

      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
      document.body.style.overflow = 'hidden';
      (select.value ? $('#order-name', dialog) : select).focus();
    };

    const close = () => {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
      document.body.style.overflow = '';
    };

    triggers.forEach((button) => {
      button.addEventListener('click', () => open(button.dataset.preorder, button.textContent.trim()));
    });

    $('.modal__close', dialog).addEventListener('click', close);
    $('[data-close]', dialog).addEventListener('click', close);
    dialog.addEventListener('close', () => (document.body.style.overflow = ''));
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) close(); // click on the backdrop
    });

    wireForm(form, {
      type: 'order',
      onSuccess: (data) => {
        const productName = PRODUCTS[data.product]?.name || data.product;
        form.hidden = true;
        done.hidden = false;
        $('p', done).textContent = `${MSG.preorderDone(data.name.trim())} (${data.quantity} × ${productName})`;
        $('[data-close]', done).focus();
      }
    });
  }

  /* ------------------------------------------------------------------
     Marquee (seamless loop that fills any screen width)
     ------------------------------------------------------------------ */
  function initMarquee() {
    const track = $('.marquee__track');
    const first = track && track.firstElementChild;
    if (!first || reducedMotion) return;

    const build = () => {
      while (track.children.length > 1) track.lastElementChild.remove();
      const width = first.getBoundingClientRect().width;
      if (!width) return;

      track.style.setProperty('--group-w', `${width}px`);
      track.style.animationDuration = `${Math.round(width / 70)}s`; // ~70px per second

      const copies = Math.ceil(window.innerWidth / width) + 1;
      for (let i = 0; i < copies; i++) {
        const clone = first.cloneNode(true);
        clone.setAttribute('aria-hidden', 'true');
        track.append(clone);
      }
    };

    build();
    window.addEventListener('resize', debounce(build, 150));
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(build);
  }

  /* ------------------------------------------------------------------
     Nav highlight while scrolling the About page
     ------------------------------------------------------------------ */
  function initNavSpy() {
    const ids = ['about', 'products', 'contact'];
    const sections = ids.map((id) => document.getElementById(id)).filter(Boolean);
    if (!sections.length) return;

    const links = $$('.site-nav a');
    const setActive = (id) => {
      links.forEach((link) => {
        const active = link.getAttribute('href') === `#${id}`;
        link.classList.toggle('is-active', active);
        if (active) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    };

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActive(entry.target.id);
        });
      },
      { rootMargin: '-35% 0px -55% 0px' }
    );
    sections.forEach((section) => observer.observe(section));
  }

  /* ------------------------------------------------------------------
     Reveal on scroll
     ------------------------------------------------------------------ */
  function initReveal() {
    const items = $$('.reveal');
    if (!items.length) return;

    if (!('IntersectionObserver' in window) || reducedMotion) {
      items.forEach((el) => el.classList.add('is-visible'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );
    items.forEach((el) => observer.observe(el));
  }

  /* ------------------------------------------------------------------
     Missing-image placeholders (shows which file to drop in /assets)
     ------------------------------------------------------------------ */
  function initImageFallbacks() {
    const swap = (img) => {
      if (!img.isConnected) return;
      const box = document.createElement('div');
      box.className = `${img.className} img-placeholder`;
      box.setAttribute('role', 'img');
      box.setAttribute('aria-label', img.alt || '');
      box.textContent = img.getAttribute('src');
      img.replaceWith(box);
    };

    $$('img').forEach((img) => {
      if (img.complete && img.naturalWidth === 0) swap(img);
      else img.addEventListener('error', () => swap(img), { once: true });
    });
  }

  /* ------------------------------------------------------------------
     Automatic cookie carousel
     ------------------------------------------------------------------ */
  function initHeroCarousel() {
    const stage = $('.hero__stage');
    if (!stage || reducedMotion) return;

    const cookies = $$('.hero__cookie', stage);
    if (cookies.length !== 3) return;

    let timer;
    const positions = ['left', 'center', 'right'];

    const rotate = () => {
      cookies.forEach((cookie) => {
        const current = positions.findIndex((position) =>
          cookie.classList.contains(`hero__cookie--${position}`)
        );
        const next = (current + 1) % positions.length;
        cookie.classList.remove(`hero__cookie--${positions[current]}`);
        cookie.classList.add(`hero__cookie--${positions[next]}`);
      });
    };

    const start = () => {
      clearInterval(timer);
      timer = setInterval(rotate, 4000);
    };

    cookies.forEach((cookie) => {
      cookie.addEventListener('click', () => {
        const target = document.getElementById(cookie.dataset.flavor);
        if (!target) return;
        clearInterval(timer);
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

    stage.addEventListener('mouseenter', () => clearInterval(timer));
    stage.addEventListener('mouseleave', start);
    stage.addEventListener('focusin', () => clearInterval(timer));
    stage.addEventListener('focusout', start);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) clearInterval(timer);
      else start();
    });

    start();
  }

  /* ------------------------------------------------------------------ */
  function init() {
    initImageFallbacks();
    initMarquee();
    initHeroCarousel();
    initForms();
    initOrderDialog();
    initNavSpy();
    initReveal();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();