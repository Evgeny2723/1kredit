  $(document).ready(function() {
        // Находим все числовые поля ввода
    $('input[type="number"]').on('focus', function() {
        // Когда поле в фокусе, отключаем обработчик события "wheel"
        $(this).on('wheel', function(e) {
            e.preventDefault();
        });
    });
    
    // Когда поле теряет фокус, возвращаем стандартное поведение
    $('input[type="number"]').on('blur', function() {
        $(this).off('wheel');
    });

    // --- ИНИЦИАЛИЗАЦИЯ И УПРАВЛЕНИЕ ИНТЕРФЕЙСОМ ---
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

    // --- УНИВЕРСАЛЬНЫЙ ОБРАБОТЧИК ДЛЯ КНОПОК "ПРИМЕНИТЬ" (кроме Неравномерных) ---
    $(document).on('click', '.calculate-btn', function(event) {
      event.preventDefault();
      var parentId = $(this).closest('.calculator-mode').attr('id');

      switch (parentId) {
        case 'calc-lump-sum':       calculateLumpSum(); break;
        case 'calc-annuity':        calculateAnnuity(); break;
        case 'calc-differentiated': calculateDifferentiated(); break;
          // 'calc-irregular' здесь нет, так как у него своя логика кнопок
      }
    });

    // --- ФУНКЦИИ-ОБРАБОТЧИКИ ДЛЯ КАЖДОГО ТИПА КАЛЬКУЛЯТОРА ---

    function calculateLumpSum() {
      const resultsDiv = $('#ls-results'); // Находим блок результатов
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

      $('#ls-results').html(`
            <p>Срок кредита: <b>${days} дней</b></p>
            <p>Сумма переплаты: <b>${overpayment.toLocaleString('ru-RU')} тенге</b></p>
            <p><b>Годовая эффективная ставка вознаграждения (ГЭСВ): ${gesv}%</b></p>
        `);
    }

    function calculateAnnuity() {
      const resultsDiv = $('#an-results'); // Находим блок результатов
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

      $('#an-results').html(`
            <p>Ежемесячная выплата: <b>${monthlyPayment.toLocaleString('ru-RU', {minimumFractionDigits: 2, maximumFractionDigits: 2})} тг.</b></p>
            <p>Общая сумма выплат: <b>${totalPayments.toLocaleString('ru-RU', {minimumFractionDigits: 2, maximumFractionDigits: 2})} тг.</b></p>
            <p>Сумма переплаты (проценты): <b>${totalInterest.toLocaleString('ru-RU', {minimumFractionDigits: 2, maximumFractionDigits: 2})} тг.</b></p>
            <p>Комиссии за весь срок: <b>${commission.toLocaleString('ru-RU', {minimumFractionDigits: 2, maximumFractionDigits: 2})} тг.</b></p>
            <p><b>Годовая эффективная ставка вознаграждения (ГЭСВ): ${gesv}%</b></p>
        `);
    }

    function calculateDifferentiated() {
      const resultsDiv = $('#df-results'); // Находим блок результатов
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

      let resultsHtml = `
            <p>Общая сумма выплат (ОД + %): <b>${totalPaymentAmount.toLocaleString('ru-RU', {minimumFractionDigits: 2, maximumFractionDigits: 2})} тг.</b></p>
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

    // --- ЛОГИКА ДЛЯ НЕРЕВНОМЕРНЫХ ПЛАТЕЖЕЙ (IRREGULAR) ---
    // Этот блок полностью самодостаточен и использует свои кнопки

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
      let scheduleHtml = `
            <h4>График платежей:</h4>
            <table style="width:100%; border-collapse: collapse;">
            <thead><tr style="background-color:#f2f2f2;">
            <th style="padding: 8px; border: 1px solid #ddd; text-align:left;">№</th><th style="padding: 8px; border: 1px solid #ddd; text-align:left;">Дата</th>
            <th style="padding: 8px; border: 1px solid #ddd; text-align:left;">Сумма</th><th style="padding: 8px; border: 1px solid #ddd; text-align:left;"></th>
  </tr></thead><tbody>`;
      irregularPayments.forEach((p, index) => {
        scheduleHtml += `
                <tr>
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
      const resultsDiv = $('#ir-results'); // Находим блок результатов
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
      $('#ir-results').html(`
            <p>Общая сумма выплат: <b>${totalPayments.toLocaleString('ru-RU')} тг.</b></p>
            <p>Сумма переплаты: <b>${overpayment.toLocaleString('ru-RU')} тг.</b></p>
            <p><b>Годовая эффективная ставка вознаграждения (ГЭСВ): ${gesv}%</b></p>
        `);
    }

    // --- ОБЩИЕ ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---
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

  const inputs = document.querySelectorAll('.input-field');
  inputs.forEach(input => handleLabel(input));

  $(document).ready(function() {
    if ($('.input-field').length) {
      var clearInput = new $.Zebra_ClearInput('.input-field', {
        container_class_name: 'Zebra_ClearInput_Container',
        button_class_name: 'Zebra_ClearInput',
        on_clear: function(element) {
          if (element.id === 'ApplicationPhone') {
            phoneMask.value = '';
            phoneMask.updateValue();
          }
        }
      });
    }
  });

  document.addEventListener('DOMContentLoaded', function() {
    const popupLinks = document.getElementById('popup-links');
    if (popupLinks) {
      popupLinks.classList.add('visible');
    }
  });

  $(document).ready(function() {
    // Настройка масок для полей ввода телефонов
    var phoneElement = document.getElementById('ApplicationPhone');
    if (phoneElement) {
      var phoneMask = IMask(phoneElement, {
        mask: '+{7} (000) 000-00-00',
        lazy: false
      });
    }

    var phoneElement2 = document.getElementById('ApplicationPhone-2');
    if (phoneElement2) {
      var phoneMask2 = IMask(phoneElement2, {
        mask: '+{7} (000) 000-00-00',
        lazy: false
      });
    }

    // Функция для тегирования менеджеров по городам
    function getManagerTags(city) {
      const managerMapping = {
        'Алматинская область': ['@Farhat_lsrailov', '@AstanaMFO'],'Атырау': ['@Farhat_lsrailov', '@AstanaMFO'],'Тараз': ['@Farhat_lsrailov', '@AstanaMFO'],'Талдыкорган': ['@Farhat_lsrailov', '@AstanaMFO'],'Костанай': ['@Farhat_lsrailov', '@AstanaMFO'],'Жезказган': ['@Farhat_lsrailov', '@AstanaMFO'],'Уральск': ['@Farhat_lsrailov', '@AstanaMFO'],'Караганда': ['@Farhat_lsrailov', '@AstanaMFO'],'Кокшетау': ['@Farhat_lsrailov', '@AstanaMFO'],'Павлодар': ['@Farhat_lsrailov', '@AstanaMFO'],'Усть-Каменогорск': ['@Farhat_lsrailov', '@AstanaMFO'],'Петропавловск': ['@Farhat_lsrailov', '@AstanaMFO'],'Семей': ['@Farhat_lsrailov', '@AstanaMFO'],'Туркестан': ['@Farhat_lsrailov', '@AstanaMFO'],'Алматы': ['@Farhat_lsrailov'],'Астана': ['@AstanaMFO'],'Шымкент': ['@Farhat_lsrailov', '@AstanaMFO'],'Актобе': ['@Farhat_lsrailov', '@AstanaMFO'],
      };
      return managerMapping[city] || [];
    };

    // Кастомные правила валидации
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


    // --- ОБЩАЯ ФУНКЦИЯ ДЛЯ ОБРАБОТКИ ВСЕХ ФОРМ ---
    function handleFormSubmit(form) {
      if (grecaptcha.getResponse().length === 0) {
        alert("Пожалуйста, подтвердите, что вы не робот.");
        return;
      }

      const formData = new FormData(form);

      // --- Отправка данных в Google Таблицу (оставлено без изменений) ---
      const googleScriptURL = 'https://script.google.com/macros/s/AKfycbwXR5JlOM-fbzMCXFBSHkYnlVXDTX5vh72ua2qsm3_U4c8utD4lqXNoQX0lVxZxnWC2/exec';
      const dataForGoogle = new URLSearchParams();
      dataForGoogle.append('2', formData.get('fullname'));
      dataForGoogle.append('3', formData.get('ApplicationPhone'));
      dataForGoogle.append('4', formData.get('ApplicationEmail'));
      fetch(googleScriptURL, { method: 'POST', body: dataForGoogle, mode: 'no-cors' })
        .catch(error => console.error('Ошибка отправки в Google Sheets:', error));


      // --- ✅ НОВЫЙ БЛОК: Формирование красивого сообщения для Telegram ---
      let message = "🔥 Новая заявка с сайта! 🔥\n\n";

      // Определяем, какие поля и с какими названиями мы хотим видеть
      const fieldLabels = {
        city: '📍 Город',
        'tip-zaloga': '🏠 Тип залога',
        fullname: '👤 ФИО',
        ApplicationPhone: '📞 Телефон',
        ApplicationEmail: '📧 Email',
        iin: '📄 ИИН'
      };

      // Собираем сообщение только из нужных полей, пропуская пустые
      for (const key in fieldLabels) {
        const value = formData.get(key);
        if (value) {
          message += `${fieldLabels[key]}: ${value}\n`;
        }
      }

      // Добавляем теги менеджеров
      const city = formData.get('city');
      const managerTags = getManagerTags(city);
      if (managerTags.length > 0) {
        message += `\n🗣️ Менеджеры: ${managerTags.join(', ')}`;
      }

      // --- Отправка в Telegram ---
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
    const formspreeURL = 'https://formspree.io/f/mvgvevpl'; // 👈 ВАШ URL ИЗ FORMSpree

    // Находим кнопку отправки и показываем прелоадер
    const submitButton = $(form).find('input[type="submit"]');
    const originalButtonText = submitButton.val();
    submitButton.val('Отправка...').prop('disabled', true);

    fetch(formspreeURL, {
      method: 'POST',
      body: formData,
      headers: {
        'Accept': 'application/json' // Formspree рекомендует этот заголовок
      }
    })
    .then(response => {
      if (response.ok) {
        // Успешная отправка
        window.location.href = 'https://www.1kredit.kz/thanks-page-google'; // Или другая страница "Спасибо"
      } else {
        // Ошибка сервера (например, Formspree)
        response.json().then(data => {
          console.error('Ошибка Formspree: ', data);
          alert('Произошла ошибка при отправке. Попробуйте еще раз.');
        });
      }
    })
    .catch(error => {
      // Ошибка сети
      console.error('Сетевая ошибка: ', error);
      alert('Произошла сетевая ошибка. Проверьте подключение.');
    })
    .finally(() => {
      // Возвращаем кнопку в исходное состояние
      submitButton.val(originalButtonText).prop('disabled', false);
    });
  }

    // Применяем валидацию и обработчик к каждой форме

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
  });

// ✅✅✅ НОВЫЙ БЛОК ВАЛИДАЦИИ ДЛЯ ФОРМЫ С ФАЙЛОМ ✅✅✅
  // =================================================================
  if ($('#questionnaire-form').length) {
    $("#questionnaire-form").validate({
      rules: {
        // Добавьте сюда правила для других полей в этой форме
        fullname: { required: true },
        ApplicationPhone: { required: true, phoneComplete: true },
        'cv-file': { required: true }, // 'cv-file' - это 'name' вашего <input type="file">
        CheckboxData: { required: true }
      },
      messages: {
        fullname: { required: "Укажите ваше ФИО" },
        ApplicationPhone: { required: "Заполните поле!", phoneComplete: "Введите полный номер телефона" },
        'cv-file': { required: "Пожалуйста, прикрепите ваш файл резюме" },
        CheckboxData: { required: "Необходимо ваше согласие" }
      },
      errorPlacement: function(error, element) {
        if (element.attr("name") == "cv-file") {
          // Помещаем ошибку для файла после всего блока загрузчика
          error.appendTo(element.closest(".file-uploader-wrapper").parent());
        } else if (element.attr("name") == "CheckboxData") {
           error.appendTo(element.closest(".w-checkbox"));
        } else {
          // Стандартное размещение
          error.appendTo(element.closest(".field-row"));
        }
      },
      highlight: function(element) { $(element).css('border', '1px solid #c50006'); },
      unhighlight: function(element) { $(element).css('border', ''); },
      submitHandler: handleQuestionnaireSubmit // 👈 Использует НОВЫЙ обработчик
    });
  }

// Этот код можно добавить в самый конец вашего <script> тега, 
// но ВНЕ блока $(document).ready()
console.log('DOM Загружен. Ищем элементы загрузчика...');

  const fileInput = document.getElementById('cv-file');
  const fileDisplayArea = document.getElementById('file-display-area');
  const fileUploadLabel = document.querySelector('.file-upload-label');

  // Проверка, найдены ли элементы
  if (!fileInput) {
    console.error('ОШИБКА: Не могу найти <input id="cv-file">. Проверьте HTML Embed.');
    return; // Останавливаем выполнение, если главного элемента нет
  }
  if (!fileDisplayArea) {
    console.warn('ПРЕДУПРЕЖДЕНИЕ: Не найден <div id="file-display-area">.');
  }
  if (!fileUploadLabel) {
    console.warn('ПРЕДУПРЕЖДЕНИЕ: Не найдена <label class="file-upload-label">.');
  }

  console.log('Элементы найдены. Добавляю слушатель "change" на fileInput...');

  // Добавляем слушатель
  fileInput.addEventListener('change', function() {
    
    console.log('Событие "change" СРАБОТАЛО!'); // 👈 Это должно появиться при выборе файла

    if (this.files && this.files.length > 0) {
      const file = this.files[0];
      console.log('Выбран файл:', file.name);
      const fileSize = (file.size / 1024 / 1024).toFixed(2); // в МБ

      // Показываем карточку файла
      fileDisplayArea.innerHTML = `
        <div class="file-display-card">
          <div class="file-info">
            <div class="file-icon">✓</div>
            <span class="file-name">${file.name}</span>
            <span class="file-size">${fileSize} MB</span>
          </div>
          <button type="button" class="file-remove-btn" id="remove-file-btn">&times;</button>
        </div>
      `;
      console.log('Карточка файла отображена.');

      // Прячем кнопку "Выберите файл"
      fileUploadLabel.style.display = 'none';
      console.log('Кнопка "Выберите файл" скрыта.');

      // Добавляем обработчик на кнопку "удалить"
      document.getElementById('remove-file-btn').addEventListener('click', function() {
        fileInput.value = ''; // Очищаем инпут
        fileDisplayArea.innerHTML = ''; // Убираем карточку
        fileUploadLabel.style.display = 'block'; // Показываем кнопку "Выберите файл"
        console.log('Файл удален.');
      });
    } else {
      console.log('Событие "change" сработало, но массив files пустой.');
    }
  });
});
