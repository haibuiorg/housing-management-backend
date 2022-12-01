import {Request, Response} from 'express';
import admin from 'firebase-admin';
import {COUNTRIES, COUNTRY_CODE} from '../../constants';
import {Country} from '../../dto/country';

export const isValidCountryCode = async (countryCode: string) => {
  const countries = await admin.firestore()
      .collection(COUNTRIES).where(COUNTRY_CODE, '==', countryCode)
      .limit(1).get();
  return countries.docs.map((doc) => doc.data())[0];
};

export const getSupportedContries =
    async (request: Request, response: Response) => {
      try {
        const countries = await admin.firestore()
            .collection(COUNTRIES).get();
        const countriesData = countries.docs.map((doc) => doc.data());
        response.status(200).send(countriesData);
      } catch (error) {
        response.status(500).send({errors: error});
      }
    };

export const getCountryData =
    async (countryCode: string) : Promise<Country> => {
      try {
        const country = ((await admin.firestore()
            .collection(COUNTRIES).where(COUNTRY_CODE, '==', countryCode)
            .limit(1).get()).docs.map((doc) => doc.data()as Country))[0];
        return country;
      } catch (error) {
        console.error(error);
        return {
          id: 'vZb0f3cm6jYPI6UaGEQf',
          country_code: 'fi',
          currency_code: 'eur',
          vat: 0.24,
        } as Country;
      }
    };
