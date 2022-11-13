'use strict';
import admin from 'firebase-admin';
const sgMail = require('@sendgrid/mail');

export const sendVerificationEmail = async (email: string) => {
  const verifyLink = await admin.auth().generateEmailVerificationLink(email);
  const msg = {
    to: email, // Change to your recipient
    from: {
      email: 'contact@kierr.co',
      name: 'Priorli App',
    },
    subject: 'Verify your email with Kierr App',
    html: `Hello\,
        <br>Follow this <a href="${verifyLink}">link</a>
         to verify your email address.<br>
        If you didn\'t ask to verify this address, you can ignore this email.
        <br>Thank you and enjoy our app,<br>Your Priorli app team`,
  };
  sgMail.setApiKey(process.env.SENDGRID);
  await sgMail.send(msg);
};

export const sendInvitationEmail = async (email: string[], code: string) => {
  const msg = {
    to: email, // Change to your recipient
    from: {
      email: 'contact@kierr.co',
      name: 'Priorli App',
    },
    subject: 'Create account with Priorli App',
    html: `Hello\,
        <br>Use this code: "${code}">
         to create user and get access to your housing company.<br>
        <br>Thank you and enjoy our app,
        <br>Your Priorli app team`,
  };
  sgMail.setApiKey(process.env.SENDGRID);
  await sgMail.send(msg, true);
};

