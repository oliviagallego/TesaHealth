const { sendMail } = require("./mailer");
const { resultsTemplate } = require("./emailTemplates");

async function sendResultsEmail({ user, summary, reportUrl }) {
  const tpl = resultsTemplate({ name: user.name, summary, reportUrl });
  await sendMail({ to: user.email, subject: tpl.subject, text: tpl.text, html: tpl.html });
}

module.exports = { sendResultsEmail };
