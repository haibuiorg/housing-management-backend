import {Request, Response} from 'express';
import {isAdminRole, isCompanyOwner, isCompanyTenant}
  from '../authentication/authentication';
import admin from 'firebase-admin';
import {BANK_ACCOUNTS, HOUSING_COMPANIES, HOUSING_COMPANY_ID, IS_DELETED}
  from '../../constants';
import {BankAccount} from '../../dto/bank_account';


export const getCompanyBankAccountRequest =
    async (request:Request, response: Response) => {
    // @ts-ignore
      const userId = request.user?.uid;
      const housingCompanyId =
        request.query.housing_company_id?.toString() ?? '';
      if (!await isCompanyTenant(userId, housingCompanyId)) {
        response.status(403)
            .send({errors: {error: 'Not tenants', code: 'not_tenant'}});
      }
      try {
        const isDeleted = request.query.is_deleted;
        if (isDeleted && await isAdminRole(userId)) {
          const bankAccountData =
              await getBankAccounts(housingCompanyId, true);
          response.status(200).send(bankAccountData);
          return;
        }
        const bankAccountData = await getBankAccounts(housingCompanyId);
        response.status(200).send(bankAccountData);
      } catch (errors) {
        console.log(errors);
        response.status(500).send(errors);
      }
    };

export const addCompanyBankAccountRequest =
    async (request:Request, response: Response) => {
    // @ts-ignore
      const userId = request.user?.uid;
      const housingCompanyId =
        request.body.housing_company_id?.toString() ?? '';
      const swift = request.body.swift?.toString() ?? '';
      const bankAccountNumber =
        request.body.bank_account_number?.toString() ?? '';
      if (swift.length === 0 || bankAccountNumber.length === 0) {
        response.status(500)
            .send({errors:
                {error: 'Missing params', code: 'missing_query_params'},
            });
      }
      if (!await isCompanyOwner(userId, housingCompanyId)) {
        response.status(403)
            .send({errors: {error: 'Not owner', code: 'not_owner'}});
      }
      const id = admin.firestore().collection(HOUSING_COMPANIES)
          .doc(housingCompanyId).collection(BANK_ACCOUNTS).doc().id;
      const bankAccount : BankAccount = {
        id: id,
        swift: swift,
        bank_account_number: bankAccountNumber,
        is_deleted: false,
        housing_company_id: housingCompanyId,
      };
      try {
        await admin.firestore().collection(HOUSING_COMPANIES)
            .doc(housingCompanyId).collection(BANK_ACCOUNTS).doc(id)
            .set(bankAccount);
        response.status(200).send(bankAccount);
      } catch (errors) {
        console.log(errors);
        response.status(500)
            .send({errors:
            errors,
            });
      }
    };

export const deleteCompanyBankAccountRequest =
    async (request:Request, response: Response) => {
    // @ts-ignore
      const userId = request.user?.uid;
      const housingCompanyId =
        request.body.housing_company_id?.toString() ?? '';
      const bankAccountId = request.body.bank_account_id?.toString() ?? '';
      if (bankAccountId.length === 0) {
        response.status(500)
            .send({errors:
                {error: 'Missing params', code: 'missing_query_params'},
            });
      }
      if (!await isCompanyOwner(userId, housingCompanyId)) {
        response.status(403)
            .send({errors: {error: 'Not owner', code: 'not_owner'}});
      }
      try {
        await admin.firestore().collection(HOUSING_COMPANIES)
            .doc(housingCompanyId).collection(BANK_ACCOUNTS).doc(bankAccountId)
            .update({is_deleted: true});
        const bankAccountData = await getBankAccounts(housingCompanyId);
        response.status(200).send(bankAccountData);
      } catch (errors) {
        response.status(500)
            .send({errors:
            errors,
            });
      }
    };

export const getBankAccounts =
    async (housingCompanyId: String, isDeleted?: boolean) => {
      if (isDeleted) {
        const bankAccountData = await admin.firestore()
            .collectionGroup(BANK_ACCOUNTS)
            .where(HOUSING_COMPANY_ID, '==', housingCompanyId)
            .get();
        return bankAccountData.docs.map((doc) => doc.data() as BankAccount);
      } else {
        const bankAccountData = await admin.firestore()
            .collectionGroup(BANK_ACCOUNTS)
            .where(HOUSING_COMPANY_ID, '==', housingCompanyId)
            .where(IS_DELETED, '==', false).get();
        return bankAccountData.docs.map((doc) => doc.data() as BankAccount);
      }
    };
