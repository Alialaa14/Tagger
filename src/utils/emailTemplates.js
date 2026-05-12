/**
 * Base wrapper for all emails to ensure consistent branding and modern design.
 */
const baseEmailWrapper = (title, content, preheader = "") => {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    body {
      margin: 0;
      padding: 0;
      width: 100% !important;
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background-color: #f6faf7;
    }
    table {
      border-spacing: 0;
      mso-table-lspace: 0pt;
      mso-table-rspace: 0pt;
    }
    img {
      border: 0;
      line-height: 100%;
      outline: none;
      text-decoration: none;
    }
    .content-table {
      width: 100%;
      max-width: 600px;
      margin: 40px auto;
      background-color: #ffffff;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 4px 20px rgba(15, 23, 42, 0.06);
    }
    .header {
      background: linear-gradient(135deg, #22c55e, #16a34a);
      padding: 40px 20px;
      text-align: center;
      color: #ffffff;
    }
    .body {
      padding: 40px;
      color: #1e293b;
      line-height: 1.6;
      text-align: right;
    }
    .footer {
      padding: 30px;
      text-align: center;
      font-size: 12px;
      color: #64748b;
      background-color: #f8fafc;
      border-top: 1px solid rgba(22, 163, 74, 0.1);
    }
    .button {
      display: inline-block;
      padding: 14px 30px;
      background-color: #22c55e;
      color: #ffffff !important;
      text-decoration: none;
      border-radius: 12px;
      font-weight: bold;
      margin: 20px 0;
      box-shadow: 0 4px 12px rgba(34, 197, 94, 0.2);
    }
    .otp-code {
      font-size: 36px;
      font-weight: 900;
      color: #16a34a;
      background: #f0fdf4;
      padding: 20px;
      border-radius: 12px;
      display: inline-block;
      letter-spacing: 8px;
      margin: 20px 0;
      border: 2px dashed #bbf7d0;
    }
    h1, h2, h3 {
      color: #0f172a;
      margin-top: 0;
    }
    @media only screen and (max-width: 600px) {
      .content-table {
        margin: 0 !important;
        border-radius: 0 !important;
      }
      .body {
        padding: 30px 20px;
      }
    }
  </style>
</head>
<body>
  <div style="display: none; max-height: 0px; overflow: hidden;">${preheader}</div>
  <table width="100%" border="0" cellspacing="0" cellpadding="0" bgcolor="#f6faf7">
    <tr>
      <td align="center">
        <table class="content-table" border="0" cellspacing="0" cellpadding="0">
          <!-- Header -->
          <tr>
            <td class="header">
              <h1 style="margin: 0; font-size: 28px; font-weight: 900; letter-spacing: -0.5px;">TAGGER</h1>
              <p style="margin: 5px 0 0; opacity: 0.9; font-size: 14px;">منصتك الذكية للتجارة</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td class="body">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td class="footer">
              <p style="margin-bottom: 10px;">تم إرسال هذا البريد الإلكتروني من قبل نظام <b>TAGGER</b></p>
              <p style="margin-bottom: 20px;">إذا كانت لديك أي استفسارات، يمكنك الرد على هذا البريد مباشرة.</p>
              <div style="margin-bottom: 20px;">
                <a href="#" style="color: #64748b; text-decoration: none; margin: 0 10px;">الرئيسية</a>
                <a href="#" style="color: #64748b; text-decoration: none; margin: 0 10px;">حسابي</a>
                <a href="#" style="color: #64748b; text-decoration: none; margin: 0 10px;">الدعم الفني</a>
              </div>
              <p>© 2026 TAGGER. جميع الحقوق محفوظة.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

/**
 * Template for Password Reset / OTP Verification
 */
export const forgetPasswordTemp = ({ otp, name }) => {
  const content = `
    <h2 style="font-size: 22px;">مرحباً ${name} 👋</h2>
    <p>تلقينا طلباً لإعادة تعيين كلمة المرور الخاصة بحسابك على TAGGER.</p>
    <p>يرجى استخدام رمز التحقق (OTP) التالي لإتمام العملية:</p>
    <div style="text-align: center;">
      <div class="otp-code">${otp}</div>
    </div>
    <p style="font-size: 14px; color: #64748b;">هذا الرمز صالح لمدة <b>10 دقائق</b> فقط. إذا لم تطلب هذا الرمز، يمكنك تجاهل هذا البريد بأمان.</p>
    <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 30px 0;">
    <p style="font-size: 13px; color: #94a3b8;">من أجل حماية حسابك، لا تشارك هذا الرمز مع أي شخص أبداً.</p>
  `;
  return baseEmailWrapper("استعادة كلمة المرور - TAGGER", content, "رمز التحقق الخاص بك هو " + otp);
};

/**
 * Template for Newsletter Subscription Welcome
 */
export const newsletterWelcomeTemp = ({ name }) => {
  const content = `
    <h2 style="font-size: 22px;">أهلاً بك في عائلة TAGGER! 🎉</h2>
    <p>يسعدنا جداً انضمامك إلى قائمتنا البريدية. من الآن فصاعداً، ستكون أول من يعلم عن:</p>
    <ul style="padding-right: 20px; list-style-type: none;">
      <li style="margin-bottom: 10px;">✅ أحدث المنتجات والماركات العالمية.</li>
      <li style="margin-bottom: 10px;">✅ عروض وخصومات حصرية للمشتركين فقط.</li>
      <li style="margin-bottom: 10px;">✅ نصائح وأخبار السوق والتجارة.</li>
    </ul>
    <p>نحن نعدك بعدم إزعاجك، وسنرسل لك فقط الأشياء التي تهمك فعلاً.</p>
    <div style="text-align: center;">
      <a href="https://tagger.com/catalog" class="button">استكشف المنتجات الآن</a>
    </div>
    <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 30px 0;">
    <p style="font-size: 13px; color: #94a3b8;">يمكنك إلغاء الاشتراك في أي وقت من خلال إعدادات حسابك.</p>
  `;
  return baseEmailWrapper("مرحباً بك في TAGGER", content, "شكراً لاشتراكك في قائمتنا البريدية");
};

/**
 * Template for General Notifications
 */
export const generalNotificationTemp = ({ name, message, buttonText, buttonLink }) => {
  const content = `
    <h2 style="font-size: 22px;">مرحباً ${name}</h2>
    <p>${message}</p>
    ${buttonText && buttonLink ? `
    <div style="text-align: center;">
      <a href="${buttonLink}" class="button">${buttonText}</a>
    </div>` : ''}
  `;
  return baseEmailWrapper("إشعار من TAGGER", content);
};
