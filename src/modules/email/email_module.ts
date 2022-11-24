'use strict';
import {Request, Response} from 'express';
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
        <br>Use this code: "${code}"
         to create user and get access to your housing company.<br>
        <br>Thank you and enjoy our app,
        <br>Your Priorli app team`,
  };
  sgMail.setApiKey(process.env.SENDGRID);
  await sgMail.send(msg, true);
};

export const sendPasswordResetEmail =
  async (request: Request, response: Response) => {
    try {
      const email = request.body.email;
      const resetPasswordLink =
      await admin.auth().generatePasswordResetLink(email);
      const msg = {
        to: email, // Change to your recipient
        from: {
          email: 'contact@kierr.co',
          name: 'Priorli App',
        },
        subject: 'Resetting your Priorli password',
        html: `Hello\,
          <br>You have requested to reset your password follow this
          <a href="${resetPasswordLink}">Reset password link</a> to continue
          .<br>If you didn\'t ask to reset your password,
           you can ignore this email.<br><br>
           Thank you and happy recycling!,<br>Your Priorli app team`,
      };
      sgMail.setApiKey(process.env.SENDGRID);
      await sgMail.send(msg);
      response.status(200).send({result: 'success'});
    } catch (error) {
      response.status(500).send({result: 'failed'});
    }
  };
