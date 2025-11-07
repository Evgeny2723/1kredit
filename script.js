$(document).ready(function() {

  $('input[type="number"]').on('focus', function() {
    $(this).on('wheel', function(e) {
      e.preventDefault();
    });
  });

  $('input[type="number"]').on('blur', function() {
    $(this).off('wheel');
  });

  flatpickr(".datepicker", {
    dateFormat: "d.m.Y",
    locale: "ru",
    disableMobile: true,
    onReady: function(selectedDates, dateStr, instance) {
      const originalName = instance.input.getAttribute('name');

      if (instance.mobileInput) {
        instance.mobileInput.setAttribute('name', originalName);
        instance.input.removeAttribute('name');
      }
    }
  });

  $('#calc-type-selector').on('change', function() {
    $('.calculator-mode').hide();
    $('#ls-results, #an-results, #df-results, #ir-results, #ir-payments-schedule').hide();
    const selectedMode = $(this).val();
    if (selectedMode) {
      $('#calc-' + selectedMode).show();
    }
  });

  $(document).on('click', '.calculate-btn', function(event) {
    event.preventDefault();
    var parentId = $(this).closest('.calculator-mode').attr('id');

    switch (parentId) {
      case 'calc-lump-sum':
        calculateLumpSum();
        break;
      case 'calc-annuity':
        calculateAnnuity();
        break;
      case 'calc-differentiated':
        calculateDifferentiated();
        break;
    }
  });

  function calculateLumpSum() {
    const resultsDiv = $('#ls-results');
    resultsDiv.show();
    const amount = parseFloat($('#ls-amount').val()) || 0;
    const startDateStr = $('#ls-start-date').val();
    const endDateStr = $('#ls-end-date').val();
    const commission = parseFloat($('#ls-commission').val()) || 0;
    const repayment = parseFloat($('#ls-repayment-amount').val()) || 0;
    const startDate = parseDate(startDateStr);
    const endDate = parseDate(endDateStr);
    if (!amount || !repayment || !startDate || !endDate || endDate <= startDate) {
      $('#ls-results').html('<p style="color:red;">Пожалуйста, заполните все поля корректными данными.</p>');
      return;
    }
    const days = daysBetween(startDate, endDate);
    const totalRepayment = repayment + commission;
    const payments = [{ amount: totalRepayment, days: days }];
    const rate = calculateRateByNewton(amount, payments);
    const gesv = isNaN(rate) ? 'Ошибка расчета' : (100 * rate).toFixed(1);
    const overpayment = totalRepayment - amount;
    $('#ls-results').html(
      `<p>Срок кредита: <b>${days} дней</b></p>
       <p>Сумма переплаты: <b>${overpayment.toLocaleString('ru-RU')} тенге</b></p>
       <p><b>Годовая эффективная ставка вознаграждения (ГЭСВ): ${gesv}%</b></p>`
    );
  }

  function calculateAnnuity() {
    const resultsDiv = $('#an-results');
    resultsDiv.show();
    const amount = parseFloat($('#an-amount').val()) || 0;
    const startDateStr = $('#an-start-date').val();
    const term = parseInt($('#an-term').val()) || 0;
    const ratePercent = parseFloat($('#an-rate').val()) || 0;
    const commission = parseFloat($('#an-commission-one-time').val()) || 0;
    if (!amount || !term || !startDateStr) {
      $('#an-results').html('<p style="color:red;">Пожалуйста, заполните все поля: Сумма, Дата и Срок.</p>');
      return;
    }
    const monthlyRate = ratePercent / 12 / 100;
    const annuityCoeff = (monthlyRate * Math.pow(1 + monthlyRate, term)) / (Math.pow(1 + monthlyRate, term) - 1);
    const monthlyPayment = ratePercent > 0 ? (amount * annuityCoeff) : (amount / term);
    const payments = [];
    const startDate = parseDate(startDateStr);
    for (let i = 0; i < term; i++) {
      let paymentDate = new Date(startDate.getFullYear(), startDate.getMonth() + i + 1, startDate.getDate());
      payments.push({ amount: monthlyPayment, days: daysBetween(startDate, paymentDate) });
    }
    if (commission > 0 && payments.length > 0) {
      payments[0].amount += commission;
    }
    const rate = calculateRateByNewton(amount, payments);
    const gesv = isNaN(rate) ? 'Ошибка расчета' : (100 * rate).toFixed(1);
    const totalPayments = payments.reduce((sum, p) => sum + p.amount, 0);
    const totalInterest = totalPayments - commission - amount;
    $('#an-results').html(
      `<p>Ежемесячная выплата: <b>${monthlyPayment.toLocaleString('ru-RU', {minimumFractionDigits: 2, maximumFractionDigits: 2})} тг.</b></p>
       <p>Общая сумма выплат: <b>${totalPayments.toLocaleString('ru-RU', {minimumFractionDigits: 2, maximumFractionDigits: 2})} тг.</b></p>
       <p>Сумма переплаты (проценты): <b>${totalInterest.toLocaleString('ru-RU', {minimumFractionDigits: 2, maximumFractionDigits: 2})} тг.</b></p>
       <p>Комиссии за весь срок: <b>${commission.toLocaleString('ru-RU', {minimumFractionDigits: 2, maximumFractionDigits: 2})} тг.</b></p>
       <p><b>Годовая эффективная ставка вознаграждения (ГЭСВ): ${gesv}%</b></p>`
    );
  }

  function calculateDifferentiated() {
    const resultsDiv = $('#df-results');
    resultsDiv.show();
    const amount = parseFloat($('#df-amount').val()) || 0;
    const startDateStr = $('#df-start-date').val();
    const term = parseInt($('#df-term').val()) || 0;
    const ratePercent = parseFloat($('#df-rate').val()) || 0;
    const commission = parseFloat($('#df-commission-one-time').val()) || 0;
    if (!amount || !term || !startDateStr) {
      $('#df-results').html('<p style="color:red;">Пожалуйста, заполните все поля: Сумма, Дата и Срок.</p>');
      return;
    }
    const monthlyRate = ratePercent / 12 / 100;
    const principalPayment = amount / term;
    let remainingPrincipal = amount;
    const paymentsForGesv = [];
    const scheduleForDisplay = [];
    let totalInterest = 0;
    const startDate = parseDate(startDateStr);
    for (let i = 0; i < term; i++) {
      const interestPayment = remainingPrincipal * monthlyRate;
      const totalMonthlyPayment = principalPayment + interestPayment;
      totalInterest += interestPayment;
      const paymentDate = new Date(startDate.getFullYear(), startDate.getMonth() + i + 1, startDate.getDate());
      scheduleForDisplay.push({ date: paymentDate.toLocaleDateString('ru-RU'), total: totalMonthlyPayment, principal: principalPayment, interest: interestPayment });
      paymentsForGesv.push({ amount: totalMonthlyPayment, days: daysBetween(startDate, paymentDate) });
      remainingPrincipal -= principalPayment;
    }
    if (commission > 0 && paymentsForGesv.length > 0) {
      paymentsForGesv[0].amount += commission;
    }
    const rate = calculateRateByNewton(amount, paymentsForGesv);
    const gesv = isNaN(rate) ? 'Ошибка расчета' : (100 * rate).toFixed(1);
    const totalPaymentAmount = amount + totalInterest;
    let resultsHtml =
      `<p>Общая сумма выплат (ОД + %): <b>${totalPaymentAmount.toLocaleString('ru-RU', {minimumFractionDigits: 2, maximumFractionDigits: 2})} тг.</b></p>
       <p>Сумма переплаты (проценты): <b>${totalInterest.toLocaleString('ru-RU', {minimumFractionDigits: 2, maximumFractionDigits: 2})} тг.</b></p>
       <p>Комиссии и иные платежи, единовременные: <b>${commission.toLocaleString('ru-RU', {minimumFractionDigits: 2, maximumFractionDigits: 2})} тг.</b></p>
       <p><b>Годовая эффективная ставка вознаграждения (ГЭСВ): ${gesv}%</b></p>
       <hr><h4>График платежей:</h4>
       <table style="width:100%; border-collapse: collapse; font-size: 14px;">
       <thead><tr style="background-color:#f2f2f2;">
       <th style="padding: 8px; border: 1px solid #ddd; text-align:left;">Дата</th><th style="padding: 8px; border: 1px solid #ddd; text-align:left;">Сумма</th>
       <th style="padding: 8px; border: 1px solid #ddd; text-align:left;">Осн. долг</th><th style="padding: 8px; border: 1px solid #ddd; text-align:left;">Проценты</th>
       </tr></thead><tbody>`;
    scheduleForDisplay.forEach(p => {
      resultsHtml += `<tr>
       <td data-label="Дата">${p.date}</td>
       <td data-label="Сумма">${p.total.toLocaleString('ru-RU', {minimumFractionDigits: 2})}</td>
       <td data-label="Осн. долг">${p.principal.toLocaleString('ru-RU', {minimumFractionDigits: 2})}</td>
       <td data-label="Проценты">${p.interest.toLocaleString('ru-RU', {minimumFractionDigits: 2})}</td>
       </tr>`;
    });
    resultsHtml += '</tbody></table>';
    $('#df-results').html(resultsHtml);
  }

  let irregularPayments = [];

  function resetIrregularCalculator() {
    irregularPayments = [];
    $('#ir-amount, #ir-start-date').prop('disabled', false).val('');
    $('#ir-new-payment-date, #ir-new-payment-amount').val('');
    $('#ir-payment-entry').hide();
    $('#ir-payments-schedule, #ir-results').empty().hide();
    $('#ir-main-btn').show();
  }

  $('#ir-amount, #ir-start-date').on('input', function() {
    if ($('#ir-amount').is(':disabled')) {
      resetIrregularCalculator();
    }
  });

  $('#ir-main-btn').on('click', function() {
    const amount = $('#ir-amount').val();
    const startDate = $('#ir-start-date').val();
    if (amount && startDate) {
      $('#ir-payment-entry').slideDown();
      $('#ir-amount, #ir-start-date').prop('disabled', true);
      $(this).hide();
    } else {
      alert('Пожалуйста, введите сумму и дату выдачи займа.');
    }
  });

  $('#ir-add-payment-btn').on('click', function() {
    const date = $('#ir-new-payment-date').val();
    const amount = parseFloat($('#ir-new-payment-amount').val());
    if (date && amount > 0) {
      irregularPayments.push({ date: date, amount: amount });
      renderIrregularPayments();
      calculateIrregular();
      $('#ir-new-payment-date, #ir-new-payment-amount').val('');
    } else {
      alert('Введите корректную дату и сумму платежа.');
    }
  });

  $(document).on('click', '.ir-remove-btn', function() {
    irregularPayments.splice($(this).data('index'), 1);
    renderIrregularPayments();
    calculateIrregular();
  });

  function renderIrregularPayments() {
    const scheduleDiv = $('#ir-payments-schedule');
    scheduleDiv.show();
    if (irregularPayments.length === 0) {
      $('#ir-payments-schedule').empty();
      return;
    }
    irregularPayments.sort((a, b) => parseDate(a.date) - parseDate(b.date));
    let scheduleHtml =
      `<h4>График платежей:</h4>
       <table style="width:100%; border-collapse: collapse;">
       <thead><tr style="background-color:#f2f2f2;">
       <th style="padding: 8px; border: 1px solid #ddd; text-align:left;">№</th><th style="padding: 8px; border: 1px solid #ddd; text-align:left;">Дата</th>
       <th style="padding: 8px; border: 1px solid #ddd; text-align:left;">Сумма</th><th style="padding: 8px; border: 1px solid #ddd; text-align:left;"></th>
       </tr></thead><tbody>`;
    irregularPayments.forEach((p, index) => {
      scheduleHtml +=
        `<tr>
           <td data-label="№">${index + 1}</td>
           <td data-label="Дата">${p.date}</td>
           <td data-label="Сумма">${p.amount.toLocaleString('ru-RU')}
             <button class="ir-remove-btn" data-index="${index}" style="cursor:pointer; background-color:#e74c3c; color:white; border:none; border-radius:4px;">&times;</button>
           </td>
         </tr>`;
    });
    scheduleHtml += '</tbody></table>';
    $('#ir-payments-schedule').html(scheduleHtml);
  }

  function calculateIrregular() {
    const resultsDiv = $('#ir-results');
    resultsDiv.show();
    $('#ir-results').show();
    if (irregularPayments.length === 0) {
      $('#ir-results').empty().hide();
      return;
    }
    const amount = parseFloat($('#ir-amount').val());
    const startDateStr = $('#ir-start-date').val();
    const payments = irregularPayments.map(p => ({
      amount: p.amount,
      days: daysBetween(parseDate(startDateStr), parseDate(p.date))
    }));
    if (payments.some(p => p.days <= 0)) {
      $('#ir-results').html('<p style="color:red;">Все даты платежей должны быть позже даты выдачи займа.</p>');
      return;
    }
    const totalPayments = irregularPayments.reduce((sum, p) => sum + p.amount, 0);
    const overpayment = totalPayments - amount;
    const rate = calculateRateByNewton(amount, payments);
    const gesv = isNaN(rate) ? 'Ошибка расчета' : (100 * rate).toFixed(1);
    $('#ir-results').html(
      `<p>Общая сумма выплат: <b>${totalPayments.toLocaleString('ru-RU')} тг.</b></p>
       <p>Сумма переплаты: <b>${overpayment.toLocaleString('ru-RU')} тг.</b></p>
       <p><b>Годовая эффективная ставка вознаграждения (ГЭСВ): ${gesv}%</b></p>`
    );
  }

  function parseDate(str) {
    if (!str || typeof str !== 'string') return null;
    const parts = str.split('.');
    if (parts.length !== 3) return null;
    return new Date(parts[2], parts[1] - 1, parts[0]);
  }

  function daysBetween(date1, date2) {
    const MS_PER_DAY = 1000 * 60 * 60 * 24;
    const utc1 = Date.UTC(date1.getFullYear(), date1.getMonth(), date1.getDate());
    const utc2 = Date.UTC(date2.getFullYear(), date2.getMonth(), date2.getDate());
    return Math.floor((utc2 - utc1) / MS_PER_DAY);
  }

  function calculateRateByNewton(loanAmount, payments, guess = 0.1, maxIter = 100, tolerance = 1e-7) {
    let rate = guess;
    for (let i = 0; i < maxIter; i++) {
      let npv = -loanAmount;
      let dNpv = 0;
      payments.forEach(p => {
        if (p.days > 0) {
          const powerTerm = Math.pow(1 + rate, p.days / 365);
          npv += p.amount / powerTerm;
          dNpv -= (p.amount * p.days) / (365 * Math.pow(1 + rate, (p.days / 365) + 1));
        }
      });
      if (Math.abs(npv) < tolerance) return rate;
      if (dNpv === 0) return NaN;
      rate = rate - npv / dNpv;
    }
    return NaN;
  }

  var phoneMask;
  var phoneMask2;

  var phoneElement = document.getElementById('ApplicationPhone');
  if (phoneElement) {
    phoneMask = IMask(phoneElement, {
      mask: '+{7} (000) 000-00-00',
      lazy: false
    });
  }

  var phoneElement2 = document.getElementById('ApplicationPhone-2');
  if (phoneElement2) {
    phoneMask2 = IMask(phoneElement2, {
      mask: '+{7} (000) 000-00-00',
      lazy: false
    });
  }
  
  if ($('.input-field').length) {
    var clearInput = new $.Zebra_ClearInput('.input-field', {
      container_class_name: 'Zebra_ClearInput_Container',
      button_class_name: 'Zebra_ClearInput',
      on_clear: function(element) {
        if (element.id === 'ApplicationPhone' && phoneMask) {
          phoneMask.value = '';
          phoneMask.updateValue();
        }
      }
    });
  }

  function getManagerTags(city) {
    const managerMapping = {
      'Алматинская область': ['@Farhat_lsrailov', '@AstanaMFO'],'Атырау': ['@Farhat_lsrailov', '@AstanaMFO'],'Тараз': ['@Farhat_lsrailov', '@AstanaMFO'],'Талдыкорган': ['@Farhat_lsrailov', '@AstanaMFO'],'Костанай': ['@Farhat_lsrailov', '@AstanaMFO'],'Жезказган': ['@Farhat_lsrailov', '@AstanaMFO'],'Уральск': ['@Farhat_lsrailov', '@AstanaMFO'],'Караганда': ['@Farhat_lsrailov', '@AstanaMFO'],'Кокшетау': ['@Farhat_lsrailov', '@AstanaMFO'],'Павлодар': ['@Farhat_lsrailov', '@AstanaMFO'],'Усть-Каменогорск': ['@Farhat_lsrailov', '@AstanaMFO'],'Петропавловск': ['@Farhat_lsrailov', '@AstanaMFO'],'Семей': ['@Farhat_lsrailov', '@AstanaMFO'],'Туркестан': ['@Farhat_lsrailov', '@AstanaMFO'],'Алматы': ['@Farhat_lsrailov'],'Астана': ['@AstanaMFO'],'Шымкент': ['@Farhat_lsrailov', '@AstanaMFO'],'Актобе': ['@Farhat_lsrailov', '@AstanaMFO'],
    };
    return managerMapping[city] || [];
  };

  $.validator.addMethod("phoneComplete", function(value, element) {
    if (element.id === 'ApplicationPhone' && phoneMask) {
      return this.optional(element) || phoneMask.unmaskedValue.length === 11;
    } else if (element.id === 'ApplicationPhone-2' && phoneMask2) {
      return this.optional(element) || phoneMask2.unmaskedValue.length === 11;
    }
    return false;
  }, "Введите полный номер телефона");

  $.validator.addMethod("validProperty", function(value, element) {
    return value !== "";
  }, "Пожалуйста, выберите тип залога");

  function handleFormSubmit(form) {
    if (grecaptcha.getResponse().length === 0) {
      alert("Пожалуйста, подтвердите, что вы не робот.");
      return;
    }
    const formData = new FormData(form);
    const googleScriptURL = 'https://script.google.com/macros/s/AKfycbwXR5JlOM-fbzMCXFBSHkYnlVXDTX5vh72ua2qsm3_U4c8utD4lqXNoQX0lVxZxnWC2/exec';
    const dataForGoogle = new URLSearchParams();
    dataForGoogle.append('2', formData.get('fullname'));
    dataForGoogle.append('3', formData.get('ApplicationPhone'));
    dataForGoogle.append('4', formData.get('ApplicationEmail'));
    fetch(googleScriptURL, { method: 'POST', body: dataForGoogle, mode: 'no-cors' })
      .catch(error => console.error('Ошибка отправки в Google Sheets:', error));

    let message = "🔥 Новая заявка с сайта! 🔥\n\n";
    const fieldLabels = {
      city: '📍 Город',
      'tip-zaloga': '🏠 Тип залога',
      fullname: '👤 ФИО',
      ApplicationPhone: '📞 Телефон',
      ApplicationEmail: '📧 Email',
      iin: '📄 ИИН'
    };
    for (const key in fieldLabels) {
      const value = formData.get(key);
      if (value) {
        message += `${fieldLabels[key]}: ${value}\n`;
      }
    }
    const city = formData.get('city');
    const managerTags = getManagerTags(city);
    if (managerTags.length > 0) {
      message += `\n🗣️ Менеджеры: ${managerTags.join(', ')}`;
    }
    const telegramToken = '7262273320:AAFokj1ZYaZImTX-J12HfyVZhonsEGJPaO0';
    const chatId = '-1002345970825';
    const url = `https://api.telegram.org/bot${telegramToken}/sendMessage`;
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message })
    })
    .then(response => response.json())
    .then(data => {
      if (data.ok) {
        window.location.href = 'https://www.1kredit.kz/thanks-page-google';
      } else {
        console.error('Ошибка Telegram: ', data);
        alert('Произошла ошибка при отправке.');
      }
    })
    .catch(error => {
      console.error('Ошибка сети: ', error);
      alert('Произошла сетевая ошибка.');
    });
  }

  // ✅✅✅ НОВАЯ ФУНКЦИЯ ДЛЯ ФОРМЫ С ФАЙЛОМ (АНКЕТА) ✅✅✅
  // =================================================================
  function handleQuestionnaireSubmit(form) {
     if (grecaptcha.getResponse().length === 0) {
       alert("Пожалуйста, подтвердите, что вы не робот.");
       return;
     }
    const formData = new FormData(form);
    const formspreeURL = 'https://formspree.io/f/mvgvevpl';
    const submitButton = $(form).find('input[type="submit"]');
    const originalButtonText = submitButton.val();
    submitButton.val('Отправка...').prop('disabled', true);
    fetch(formspreeURL, {
      method: 'POST',
      body: formData,
      headers: {
        'Accept': 'application/json'
      }
    })
    .then(response => {
      if (response.ok) {
        window.location.href = 'https://www.1kredit.kz/thanks-page-google';
      } else {
        response.json().then(data => {
          console.error('Ошибка Formspree: ', data);
          alert('Произошла ошибка при отправке. Попробуйте еще раз.');
        });
      }
    })
    .catch(error => {
      console.error('Сетевая ошибка: ', error);
      alert('Произошла сетевая ошибка. Проверьте подключение.');
    })
    .finally(() => {
      submitButton.val(originalButtonText).prop('disabled', false);
    });
  }

  if ($('#hero-application-form').length) {
    $("#hero-application-form").validate({
      rules: { 'tip-zaloga': { required: true, validProperty: true }, fullname: { required: true }, ApplicationPhone: { required: true, phoneComplete: true }, iin: { required: true, maxlength: 12 }, ApplicationEmail: { required: true, email: true }, CheckboxData: { required: true } },
      messages: { 'tip-zaloga': { required: "Заполните поле!", validProperty: "Пожалуйста, выберите тип залога" }, fullname: { required: "Укажите точно как в паспорте" }, ApplicationPhone: { required: "Заполните поле!", phoneComplete: "Введите полный номер телефона" }, iin: { required: "Заполните поле!", maxlength: "Не верно указан ИИН" }, ApplicationEmail: { required: "Заполните поле!", email: "Введите корректный email адрес" }, CheckboxData: { required: "Заполните поле!" } },
      errorPlacement: function (error, element) { error.appendTo(element.closest(".field-row")); },
      highlight: function(element) { $(element).css('border', '1px solid #c50006'); },
      unhighlight: function(element) { $(element).css('border', ''); },
      submitHandler: handleFormSubmit
    });
  }

  if ($('#application-form').length) {
    $("#application-form").validate({
      rules: { 'tip-zaloga': { required: true, validProperty: true }, fullname: { required: true }, ApplicationPhone: { required: true, phoneComplete: true }, iin: { required: true, maxlength: 12 }, ApplicationEmail: { required: true, email: true }, CheckboxData: { required: true } },
      messages: { 'tip-zaloga': { required: "Заполните поле!", validProperty: "Пожалуйста, выберите тип залога" }, fullname: { required: "Укажите точно как в паспорте" }, ApplicationPhone: { required: "Заполните поле!", phoneComplete: "Введите полный номер телефона" }, iin: { required: "Заполните поле!", maxlength: "Не верно указан ИИН" }, ApplicationEmail: { required: "Заполните поле!", email: "Введите корректный email адрес" }, CheckboxData: { required: "Заполните поле!" } },
      errorPlacement: function (error, element) { error.appendTo(element.closest(".field-row")); },
      highlight: function(element) { $(element).css('border', '1px solid #c50006'); },
      unhighlight: function(element) { $(element).css('border', ''); },
      submitHandler: handleFormSubmit
    });
  }

  if ($('#feedback-form').length) {
    $("#feedback-form").validate({
      rules: { fullname: { required: true }, ApplicationPhone: { required: true, phoneComplete: true }, ApplicationEmail: { required: true, email: true }, CheckboxData: { required: true } },
      messages: { fullname: { required: "Укажите точно как в паспорте" }, ApplicationPhone: { required: "Заполните поле!", phoneComplete: "Введите полный номер телефона" }, ApplicationEmail: { required: "Заполните поле!", email: "Введите корректный email адрес" }, CheckboxData: { required: "Заполните поле!" } },
      errorPlacement: function (error, element) { error.appendTo(element.closest(".field-row")); },
      highlight: function(element) { $(element).css('border', '1px solid #c50006'); },
      unhighlight: function(element) { $(element).css('border', ''); },
      submitHandler: handleFormSubmit
    });
  }

   // ✅✅✅ НОВЫЙ БЛОК ВАЛИДАЦИИ ДЛЯ ФОРМЫ С ФАЙЛОМ ✅✅✅
  // =================================================================
  if ($('#questionnaire-form').length) {
    $("#questionnaire-form").validate({
      rules: {
        city: { required: true },
        fullname: { required: true },
        ApplicationPhone: { required: true, phoneComplete: true },
        'cv-file': { required: true },
        CheckboxData: { required: true }
      },
      messages: {
        city: { required: "Укажите ваш город" },
        fullname: { required: "Укажите ваше ФИО" },
        ApplicationPhone: { required: "Заполните поле!", phoneComplete: "Введите полный номер телефона" },
        'cv-file': { required: "Пожалуйста, прикрепите ваш файл резюме" },
        CheckboxData: { required: "Необходимо ваше согласие" }
      },
      errorPlacement: function(error, element) {
        if (element.attr("name") == "cv-file") {
          error.appendTo(element.closest(".file-uploader-wrapper").parent());
        } else if (element.attr("name") == "CheckboxData") {
           error.appendTo(element.closest(".w-checkbox"));
        } else {
          error.appendTo(element.closest(".field-row"));
        }
      },
      highlight: function(element) { $(element).css('border', '1px solid #c50006'); },
      unhighlight: function(element) { $(element).css('border', ''); },
      submitHandler: handleQuestionnaireSubmit
    });
  }

});

function handleLabel(input) {
  const parentWrapper = input.closest('.field-row');
  if (!parentWrapper) return;
  if (!input) return;
  const label = parentWrapper.querySelector('.input-label');
  const updateLabelState = () => {
    if (input.value !== '') {
      label.classList.add('active');
      input.classList.add('not-empty');
    } else {
      label.classList.remove('active');
      input.classList.remove('not-empty');
    }
  };
  updateLabelState();
  input.addEventListener('focus', () => label.classList.add('active'));
  input.addEventListener('blur', () => updateLabelState());
  input.addEventListener('input', () => updateLabelState());
}

document.addEventListener('DOMContentLoaded', function() {
  
  const inputs = document.querySelectorAll('.input-field');
  inputs.forEach(input => handleLabel(input));
  
  const popupLinks = document.getElementById('popup-links');
  if (popupLinks) {
    popupLinks.classList.add('visible');
  }

  // ✅✅✅ НОВЫЙ БЛОК ДЛЯ UI ЗАГРУЗЧИКА ФАЙЛОВ ✅✅✅
  // =================================================================
  const fileInput = document.getElementById('cv-file');
  const fileDisplayArea = document.getElementById('file-display-area');
  const fileUploadLabel = document.querySelector('.file-upload-label');

  if (!fileInput) {
    return; // Выходим, если на странице нет загрузчика
  }
  
  // --- 1. ОБРАБОТЧИК ДЛЯ КЛИКА (он у вас уже был) ---
  // Срабатывает, когда пользователь ВЫБИРАЕТ файл из окна
  fileInput.addEventListener('change', function() {
    if (this.files && this.files.length > 0) {
      const file = this.files[0];
      const fileSize = (file.size / 1024 / 1024).toFixed(2);
      
      fileDisplayArea.innerHTML = `
        <div class="file-display-card">
          <div class="file-info">
            <div class="file-icon">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3.70223 9.44296C3.32457 9.44296 3.01439 9.27882 2.73335 8.91462L0.271809 5.92028C0.0922115 5.69048 0 5.45862 0 5.20413C0 4.69242 0.405797 4.27739 0.91566 4.27739C1.23408 4.27739 1.47495 4.38411 1.7333 4.71556L3.66932 7.17368L7.82277 0.523526C8.04075 0.1806 8.3254 0 8.63355 0C9.13523 0 9.59586 0.35196 9.59586 0.878297C9.59586 1.11013 9.47432 1.35562 9.33392 1.58644L4.63463 8.90742C4.4038 9.25876 4.07809 9.44296 3.70223 9.44296Z" fill="white" />
              </svg>
            </div>
            <span class="file-name">${file.name}</span>
            <span class="file-size">${fileSize} MB</span>
          </div>
          <button type="button" class="file-remove-btn" id="remove-file-btn">&times;</button>
        </div>
      `;
      
      fileUploadLabel.style.display = 'none';
      
      document.getElementById('remove-file-btn').addEventListener('click', function() {
        fileInput.value = '';
        fileDisplayArea.innerHTML = '';
        fileUploadLabel.style.display = 'block';
      });
      
    } else {
      console.log('Событие "change" сработало, но массив files пустой.');
    }
  });

  // --- 2. НОВЫЕ ОБРАБОТЧИКИ ДЛЯ DRAG & DROP ---
  // Мы вешаем их на <label>, так как <input> скрыт
  
  if (!fileUploadLabel) return; // Выходим, если нет и лейбла

  // Срабатывает, когда файл ПРОНОСЯТ НАД областью
  fileUploadLabel.addEventListener('dragover', function(event) {
    event.preventDefault(); // ОБЯЗАТЕЛЬНО, иначе 'drop' не сработает
    fileUploadLabel.classList.add('drag-over');
  });

  // Срабатывает, когда файл УНОСЯТ ИЗ области
  fileUploadLabel.addEventListener('dragleave', function(event) {
    event.preventDefault();
    fileUploadLabel.classList.remove('drag-over');
  });

  // Срабатывает, когда файл БРОСАЮТ в область
  fileUploadLabel.addEventListener('drop', function(event) {
    event.preventDefault(); // ОБЯЗАТЕЛЬНО, чтобы браузер не открыл файл
    fileUploadLabel.classList.remove('drag-over');

    // Получаем перетащенные файлы
    const droppedFiles = event.dataTransfer.files;

    if (droppedFiles.length > 0) {
      // 1. Помещаем эти файлы в наш скрытый <input>
      fileInput.files = droppedFiles;

      // 2. Вручную "вызываем" событие 'change' на инпуте.
      // Это заставит сработать наш первый обработчик (выше)
      // и нам не придется дублировать код для показа карточки!
      const changeEvent = new Event('change', { 'bubbles': true });
      fileInput.dispatchEvent(changeEvent);
    }
  });
});
