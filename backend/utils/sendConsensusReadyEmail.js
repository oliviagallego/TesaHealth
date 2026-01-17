const { sendMail } = require("./mailer");
const { consensusReadyTemplate } = require("./emailTemplates");

async function sendConsensusReadyEmail({ user, caseId, reportUrl }) {
    const tpl = consensusReadyTemplate({
        name: user?.name || "there",
        caseId,
        reportUrl
    });

    await sendMail({
        to: user.email,
        subject: tpl.subject,
        text: tpl.text,
        html: tpl.html
    });
}

module.exports = { sendConsensusReadyEmail };
