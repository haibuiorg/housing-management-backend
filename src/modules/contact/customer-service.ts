/* eslint-disable camelcase */
import { Request, Response } from "express";
import admin from "firebase-admin";
import { CONTACT_LEADS, CONTACT_LEADS_STATUS_NEW } from "../../constants";
import { isValidEmail } from "../../strings_utils";

export const submitContactForm = async (
  request: Request,
  response: Response
) => {
  const { name, email, message, phone = "" } = request.body;
  if (
    !name ||
    !email ||
    !message ||
    !name.trim() ||
    !email.trim() ||
    !message.trim() ||
    name.length > 100 ||
    email.length > 100 ||
    message.length > 1000 ||
    !isValidEmail(email)
  ) {
    response.status(400).send({ error: "Bad Request" });
    return;
  }
  const id = admin.firestore().collection(CONTACT_LEADS).doc().id;
  const type = "contact_form";
  const created_on = Date.now();
  const status = CONTACT_LEADS_STATUS_NEW;
  const contactLead = {
    id,
    name,
    email,
    message,
    type,
    created_on,
    status,
    phone,
  };
  await admin.firestore().collection(CONTACT_LEADS).doc(id).set(contactLead);
  response.sendStatus(204);
};

export const submitOfferForm = async (request: Request, response: Response) => {
  const { email, phone = "" } = request.body;
  if (!email || !email.trim() || email.length > 100 || !isValidEmail(email)) {
    response.status(400).send({ error: "Bad Request" });
    return;
  }
  const id = admin.firestore().collection(CONTACT_LEADS).doc().id;
  const type = "offer_form";
  // eslint-disable-next-line camelcase
  const created_on = Date.now();
  const status = CONTACT_LEADS_STATUS_NEW;
  // eslint-disable-next-line camelcase
  const contactLead = { id, email, type, created_on, status, phone };
  await admin.firestore().collection(CONTACT_LEADS).doc(id).set(contactLead);
  response.sendStatus(204);
};
