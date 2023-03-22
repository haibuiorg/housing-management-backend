"use strict";
import { ResponseError } from "@sendgrid/mail";
import { Request, Response } from "express";
import admin from "firebase-admin";
const sgMail = require("@sendgrid/mail");
const axios = require("axios").default;

export const sendVerificationEmail = async (email: string) => {
  const verifyLink = await admin.auth().generateEmailVerificationLink(email);
  const msg = {
    to: email,
    from: {
      email: "contact@priorli.com",
      name: "Priorli",
    },
    subject: "Verify your email with Priorli",
    html: `Hello\,
        <br>Follow this <a href="${verifyLink}">link</a>
         to verify your email address.<br>
        If you didn\'t ask to verify this address, you can ignore this email.
        <br>Thank you and enjoy our app,<br>Priorli team`,
  };
  try {
    sgMail.setApiKey(process.env.SENDGRID);
    await sgMail.send(msg, true);
  } catch (errors) {
    console.log((errors as ResponseError).response.body);
  }
};

export const sendEmail = async (
  emails: string[],
  displayName: string,
  title: string,
  subtitle: string,
  body: string,
  storageItems: string[]
): Promise<void> => {
  const fileList: { content: string; filename: string; disposition: string }[] =
    [];
  await Promise.all(
    storageItems.map(async (item: string) => {
      const [url] = await admin.storage().bucket().file(item).download();
      fileList.push({
        content: url.toString("base64"),
        filename: item,
        disposition: "attachment",
      });
    })
  );

  console.log(title);

  const msg = {
    to: emails, // Change to your recipient
    from: {
      email: "contact@priorli.com",
      name: displayName,
    },
    attachments: fileList,
    subject: `${title}`,
    html: `Hello\,
      <br>
      <br>
      ${subtitle}
      <br>
      ${body}
     `,
  };
  try {
    sgMail.setApiKey(process.env.SENDGRID);
    await sgMail.send(msg, true);
  } catch (errors) {
    console.log((errors as ResponseError).response.body);
  }
};

export const sendFaultReportEmail = async (
  emails: string[],
  senderEmail: string,
  displayName: string,
  title: string,
  body: string,
  storageItems: string[]
): Promise<void> => {
  const fileList: { content: string; filename: string; disposition: string }[] =
    [];
  await Promise.all(
    storageItems.map(async (item: string) => {
      const [url] = await admin.storage().bucket().file(item).download();
      fileList.push({
        content: url.toString("base64"),
        filename: item,
        disposition: "attachment",
      });
    })
  );

  const msg = {
    to: emails,
    cc: senderEmail, // Change to your recipient
    from: {
      email: "contact@priorli.com",
      name: displayName,
    },
    attachments: fileList,
    subject: `${title}`,
    html: `Hello\,
      <br>
      <br>
      ${body}
     `,
  };
  try {
    sgMail.setApiKey(process.env.SENDGRID);
    await sgMail.send(msg, true);
  } catch (errors) {
    console.log((errors as ResponseError).response.body);
  }
};

export const sendInvitationEmail = async (
  emails: string[],
  code: string,
  companyName: string
) => {
  const apiKey = process.env.FIREBASE_WEB_API_KEY;
  const link = "https://app.priorli.com/#/code_register?code=" + code;
  const linkData = {
    dynamicLinkInfo: {
      domainUriPrefix: "https://app.priorli.com/dynamic_links",
      link: link,
      androidInfo: {
        androidPackageName: "com.priorli.priorli",
      },
      iosInfo: {
        iosBundleId: "com.priorli.priorli",
      },
    },
  };
  const url =
    "https://firebasedynamiclinks.googleapis.com/v1/shortLinks?key=" + apiKey;
  let links = {
    shortLink: "",
  };
  try {
    links = (await axios.post(url, linkData)).data;
  } catch (error) {
    console.error(error);
  }
  const msg = {
    to: emails, // Change to your recipient
    from: {
      email: "contact@priorli.com",
      name: "Priorli",
    },
    subject: "Create account with Priorli",
    html: `Hello\,
        <br>
        <br> To create user and get access to ${companyName} housing company.
        <br>Click on this link: ${links.shortLink}
        <br>Or copy this code to register
        <h4><b>${code}</b></h4>
        <br>
        <br>Thank you and enjoy,
        <br>Your Priorli team`,
  };
  try {
    sgMail.setApiKey(process.env.SENDGRID);
    await sgMail.send(msg, true);
  } catch (errors) {
    console.log((errors as ResponseError).response.body);
  }
};

export const sendPasswordResetEmail = async (
  request: Request,
  response: Response
) => {
  try {
    const email = request.body.email;
    const resetPasswordLink = await admin
      .auth()
      .generatePasswordResetLink(email);
    const msg = {
      to: email, // Change to your recipient
      from: {
        email: "contact@priorli.com",
        name: "Priorli",
      },
      subject: "Resetting your Priorli password",
      html: `Hello\,
          <br>You have requested to reset your password follow this
          <a href="${resetPasswordLink}">Reset password link</a> to continue
          .<br>If you didn\'t ask to reset your password,
           you can ignore this email.<br><br>
           Best regards,!,
           <br>Your Priorli team`,
    };
    sgMail.setApiKey(process.env.SENDGRID);
    await sgMail.send(msg);
    response.status(200).send({ result: "success" });
  } catch (error) {
    console.log((error as ResponseError).response.body);
    response.status(500).send({ result: "failed" });
  }
};

export const sendManagerAccountCreatedEmail = async (
  email: string,
  companyName: String
) => {
  try {
    const resetPasswordLink = await admin
      .auth()
      .generatePasswordResetLink(email);
    const msg = {
      to: email, // Change to your recipient
      from: {
        email: "contact@priorli.com",
        name: "Priorli",
      },
      subject: "Welcome to Priorli",
      html: `Hello\,
          <br>You are added as a Manager for ${companyName}
          <a href="${resetPasswordLink}">Create a password</a> to continue
          .<br><br><br>
           Thank you and best regards!,
           <br>Priorli team on behalf of ${companyName}`,
    };
    sgMail.setApiKey(process.env.SENDGRID);
    await sgMail.send(msg);
  } catch (error) {
    console.log((error as ResponseError).response.body);
  }
};
