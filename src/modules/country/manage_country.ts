import { Request, Response } from 'express';
import admin from 'firebase-admin';
import { COUNTRIES, COUNTRY_CODE, IS_ACTIVE, LEGAL_DOCUMENTS } from '../../constants';
import { Country } from '../../dto/country';
import { request } from 'http';
import { LegalDocument } from '../../dto/legal_document';
import { getPublicLinkForFile } from '../storage/manage_storage';

export const isValidCountryCode = async (countryCode: string) => {
  const countries = await admin.firestore().collection(COUNTRIES).where(COUNTRY_CODE, '==', countryCode).limit(1).get();
  return countries.docs.map((doc) => doc.data())[0];
};

export const getSupportedContriesRequest = async (request: Request, response: Response) => {
  try {
    const countries = await admin.firestore().collection(COUNTRIES).get();
    const countriesData = countries.docs.map((doc) => doc.data());
    response.status(200).send(countriesData);
  } catch (error) {
    response.status(500).send({ errors: error });
  }
};

export const getSupportedContries = async (): Promise<Country[] | undefined> => {
  try {
    const countries = await admin.firestore().collection(COUNTRIES).get();
    const countriesData = countries.docs.map((doc) => doc.data() as Country);
    return countriesData;
  } catch (error) {
    console.log(error);
  }
};

export const getCountryDataRequest = async (request: Request, response: Response) => {
  try {
    const id = request.query.id?.toString() ?? '';
    const country = (await admin.firestore().collection(COUNTRIES).doc(id).get()).data() as Country;
    response.status(200).send(country);
  } catch (error) {
    response.status(500).send({ errors: error });
  }
};

export const getCountryData = async (countryCode: string): Promise<Country> => {
  try {
    const country = (
      await admin.firestore().collection(COUNTRIES).where(COUNTRY_CODE, '==', countryCode).limit(1).get()
    ).docs.map((doc) => doc.data() as Country)[0];
    return country;
  } catch (error) {
    console.error(error);
    const id = admin.firestore().collection(COUNTRIES).doc().id;
    return {
      id: id,
      country_code: 'fi',
      currency_code: 'eur',
      vat: 0.24,
      support_languages: ['fi', 'en'],
    } as Country;
  }
};

export const getCountryByCountryCodeRequest = async (request: Request, response: Response) => {
  try {
    const countryCode = request.params.country_code;
    const country = await getCountryData(countryCode);
    response.status(200).send(country);
  } catch (error) {
    response.status(500).send({ errors: error });
  }
};

export const getCountryLegalDocumentsRequest = async (request: Request, response: Response) => {
  try {
    const countryCode = request.params.country_code;
    const documents = await getLegalDocuments(countryCode);
    response.status(200).send(documents);
  } catch (error) {
    response.status(500).send({ errors: error });
  }
};

const getLegalDocuments = async (
  countryCode: string,
  onlyActive: boolean = true,
): Promise<LegalDocument[] | undefined> => {
  try {
    let documentRef = admin
      .firestore()
      .collectionGroup(LEGAL_DOCUMENTS)
      .where('country_code', '==', countryCode.toLowerCase());
    if (onlyActive) {
      documentRef = documentRef.where(IS_ACTIVE, '==', true);
    }
    const documents = await documentRef.get();
    const documentsData = documents.docs.map((doc) => doc.data() as LegalDocument);
    await Promise.all(
      documentsData.map(async (doc) => {
        if (doc.storage_link && doc.storage_link.length > 0) {
          const expiration = Date.now() + 604000;
          const docUrl = await getPublicLinkForFile(doc.storage_link, expiration);
          doc.url = docUrl;
        }
      }),
    );
    return documentsData;
  } catch (error) {
    console.error(error);
  }
};
