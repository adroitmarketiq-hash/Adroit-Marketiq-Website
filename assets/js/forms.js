/* ==========================================================================
   Adroit Marketiq — forms
   Enquiry form (contact.html) and subscribe form (insights.html).
   Validates in the browser, posts to the form's action with fetch(), and
   shows the server's answer in place. Without JavaScript the forms still post
   normally and the server redirects to thank-you.html.
   ========================================================================== */

(function () {
  'use strict';

  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var PHONE = /^[0-9+()\-.\s]+$/;
  var FAILURE = 'We could not send your message right now. Please try again in a few minutes, or reach us on WhatsApp.';

  /* One rule per field name. Returns an error message, or '' when the value is fine. */
  var rules = {
    full_name: function (value) {
      return value ? '' : 'Enter your full name.';
    },
    email: function (value) {
      if (!value) return 'Enter your email address.';
      return EMAIL.test(value) ? '' : 'Enter an email address in the format name@example.com.';
    },
    phone: function (value) {
      if (!value) return '';
      var digits = value.replace(/\D/g, '').length;
      return PHONE.test(value) && digits >= 7 && digits <= 15 ? '' : 'Enter a phone number with 7 to 15 digits, or leave it empty.';
    },
    service: function (value) {
      return value ? '' : 'Choose the service you are interested in.';
    },
    message: function (value) {
      return value.length >= 10 ? '' : 'Tell us a little about your project (at least 10 characters).';
    },
  };

  function showError(control, message) {
    var field = control.closest('[data-field]');
    if (!field) return;
    var output = field.querySelector('.field__error');
    field.classList.toggle('is-invalid', Boolean(message));
    control.setAttribute('aria-invalid', message ? 'true' : 'false');
    if (output) output.textContent = message || '';
  }

  function validate(control) {
    var rule = rules[control.name];
    if (!rule) return true;
    var message = rule(control.value.trim());
    showError(control, message);
    return !message;
  }

  function setStatus(form, message, isError) {
    var status = form.querySelector('[data-form-status]');
    if (!status) return;
    status.textContent = message;
    status.classList.toggle('is-visible', Boolean(message));
    status.classList.toggle('is-error', Boolean(isError));
  }

  /* contact.html?service=seo&industry=retail pre-selects the service and records the industry */
  function prefill(form) {
    var params = new URLSearchParams(location.search);
    var service = params.get('service');
    var industry = params.get('industry');
    if (service && form.elements.service) {
      var option = form.elements.service.querySelector('option[value="' + service.replace(/[^a-z-]/g, '') + '"]');
      if (option) form.elements.service.value = option.value;
    }
    if (industry && form.elements.industry) form.elements.industry.value = industry.replace(/[^a-z-]/g, '');
  }

  Array.prototype.forEach.call(document.querySelectorAll('[data-form]'), function (form) {
    var openedAt = performance.now();
    var controls = Array.prototype.filter.call(form.elements, function (el) {
      return rules[el.name];
    });

    prefill(form);

    controls.forEach(function (control) {
      control.addEventListener('blur', function () {
        validate(control);
      });
      control.addEventListener('input', function () {
        if (control.getAttribute('aria-invalid') === 'true') validate(control);
      });
    });

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      setStatus(form, '');

      var invalid = controls.filter(function (control) {
        return !validate(control);
      });
      if (invalid.length) {
        invalid[0].focus();
        return;
      }

      if (form.elements.elapsed_ms) form.elements.elapsed_ms.value = Math.round(performance.now() - openedAt);
      form.classList.add('is-sending');
      form.setAttribute('aria-busy', 'true');

      fetch(form.action, {
        method: 'POST',
        // sent as ordinary form fields (not multipart), which both the Vercel function and PHP read natively
        body: new URLSearchParams(new FormData(form)),
        headers: { Accept: 'application/json', 'X-Requested-With': 'fetch' },
      })
        .then(function (response) {
          return response.json().then(function (data) {
            return { status: response.status, data: data };
          });
        })
        .then(function (result) {
          var data = result.data || {};
          if (data.ok) {
            form.reset();
            openedAt = performance.now();
            setStatus(form, data.message, false);
            return;
          }
          // show field-level messages from the server next to their fields
          var first = null;
          Object.keys(data.errors || {}).forEach(function (name) {
            var control = form.elements[name];
            if (!control) return;
            showError(control, data.errors[name]);
            first = first || control;
          });
          setStatus(form, data.message || FAILURE, true);
          if (first) first.focus();
        })
        .catch(function () {
          setStatus(form, FAILURE, true);
        })
        .then(function () {
          form.classList.remove('is-sending');
          form.removeAttribute('aria-busy');
        });
    });
  });
})();
