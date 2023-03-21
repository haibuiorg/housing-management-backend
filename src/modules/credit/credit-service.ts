import { CREDITS, HOUSING_COMPANIES } from "../../constants";
import { Credit } from "../../dto/credit";
import admin from "firebase-admin";

export const addCredit = async (
  companyid: string,
  amount: number,
  currency_code: string,
  paymentInvoiceId: string,
  paymentProductItemId: string
): Promise<Credit> => {
  const id = admin
    .firestore()
    .collection(HOUSING_COMPANIES)
    .doc(companyid)
    .collection(CREDITS)
    .doc().id;
  const credit: Credit = {
    id,
    amount: Number(amount),
    currency_code,
    company_id: companyid,
    added_on: Date.now(),
    payment_invoice_id: paymentInvoiceId,
    payment_product_item_id: paymentProductItemId,
  };
  await admin
    .firestore()
    .collection(HOUSING_COMPANIES)
    .doc(companyid)
    .collection(CREDITS)
    .doc(id)
    .set(credit);
  await admin
    .firestore()
    .collection(HOUSING_COMPANIES)
    .doc(companyid)
    .update({
      credit_amount: admin.firestore.FieldValue.increment(Number(amount)),
    });
  return credit;
};

export const getTotalCredit = async (companyid: string): Promise<number> => {
  const credit = (
    await admin.firestore().collection(HOUSING_COMPANIES).doc(companyid).get()
  ).data()?.credit_amount;
  return credit;
};

export const deductCredit = async (companyid: string, amount: number) => {
  await admin
    .firestore()
    .collection(HOUSING_COMPANIES)
    .doc(companyid)
    .update({
      credit_amount: admin.firestore.FieldValue.increment(Number(amount) * -1),
    });
};
