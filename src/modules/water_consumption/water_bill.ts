import {Request, Response} from 'express';
import {Apartment} from '../../dto/apartment';
import {Company} from '../../dto/company';
import {WaterConsumption} from '../../dto/water_consumption';
import {getCompanyData} from '../housing/manage_housing_company';
import {getLatestWaterConsumption, getPreviousWaterConsumption}
  from './manage_water_consumption';
import admin from 'firebase-admin';
import {APARTMENTS, CREATED_ON, HOUSING_COMPANIES, PERIOD, WATER_BILLS, YEAR}
  from '../../constants';
import {isAuthorizedAccessToApartment}
  from '../authentication/authentication';
import {getPublicLinkForFile} from '../storage/manage_storage';
import {BankAccount} from '../../dto/bank_account';
import {getBankAccounts} from '../payment/manage_payment';

export const getWaterBillRequest =
  async (request: Request, response: Response) => {
    const apartmentId = request.query.apartment_id;
    const companyId = request.query.housing_company_id;
    const year = request.query.year;
    const period = request.query.period;
    if (!apartmentId || !year || !period ||!companyId) {
      response.status(500).send(
          {errors: {error: 'Missing query value', code: 'missing_value'}},
      );
      return;
    }
    // @ts-ignore
    const userId = request.user?.uid;
    try {
      const apartment = await isAuthorizedAccessToApartment(
          userId,
          companyId.toString() ?? '',
          apartmentId?.toString() ??'',
      );
      if (!apartment) {
        response.status(403).send(
            {errors: {error: 'Unauthorized', code: 'not_tenant'}},
        );
        return;
      }
      const waterBills = (await admin.firestore().
          collection(HOUSING_COMPANIES).doc(companyId?.toString()).
          collection(APARTMENTS).doc(apartmentId?.toString()).
          collection(WATER_BILLS).
          where(YEAR, '==', year).
          where(PERIOD, '==', period).
          orderBy(CREATED_ON, 'desc').get()).
          docs.map((doc) => doc.data());
      if (waterBills) {
        response.status(200).send(waterBills);
        return;
      }
      response.status(500).send(
          {errors: {error: 'Something went wrong', code: 'unknown_error'}},
      );
    } catch (errors) {
      response.status(500).send(
          {errors: errors},
      );
    }
  };
export const getWaterBillByYearRequest =
  async (request: Request, response: Response) => {
    const apartmentId = request.query.apartment_id;
    const companyId = request.query.housing_company_id;
    const year = request.params.year;

    if (!apartmentId || !year ||!companyId) {
      response.status(500).send(
          {errors: {error: 'Missing query value', code: 'missing_value'}},
      );
      return;
    }
    // @ts-ignore
    const userId = request.user?.uid;
    try {
      const apartment = await isAuthorizedAccessToApartment(
          userId,
          companyId.toString() ?? '',
          apartmentId?.toString() ??'',
      );
      if (!apartment) {
        response.status(403).send(
            {errors: {error: 'Unauthorized', code: 'not_tenant'}},
        );
        return;
      }
      const waterBills = (await admin.firestore().
          collection(HOUSING_COMPANIES).doc(companyId?.toString()).
          collection(APARTMENTS).doc(apartmentId?.toString()).
          collection(WATER_BILLS).
          where(YEAR, '==', parseInt(year)).
          orderBy(CREATED_ON, 'desc').get()).
          docs.map((doc) => doc.data());
      if (waterBills) {
        response.status(200).send(waterBills);
        return;
      }
      response.status(500).send(
          {errors: {error: 'Something went wrong', code: 'unknown_error'}},
      );
    } catch (errors) {
      console.log(errors);
      response.status(500).send(
          {errors: errors},
      );
    }
  };

export const generateLatestWaterBill =
  async (
      userId: string,
      apartmentId:string,
      companyId: string,
      consumption: number) => {
    const waterConsumption =
      await getLatestWaterConsumption(companyId.toString());
    const previousPeriodConsumption =
      await getPreviousWaterConsumption(companyId);
    try {
      const apartment = await isAuthorizedAccessToApartment(
          userId,
          companyId.toString() ?? '',
          apartmentId?.toString() ??'',
      );
      if (!apartment) {
        return undefined;
      }
      const company = await getCompanyData(companyId.toString() ?? '');
      const id = company?.water_bill_template_id;
      const bankAccounts = await getBankAccounts(companyId.toString() ?? '');
      const previousConsumptionValue =
        (previousPeriodConsumption as WaterConsumption)
            .consumption_values?.
            find((value) =>
              value.apartment_id === apartment.id)?.consumption ?? 0;
      const differenceBetweenPeriod = consumption - previousConsumptionValue;
      await updateBillTemplate(
          company!,
          apartment as Apartment,
          waterConsumption as WaterConsumption,
          previousPeriodConsumption as WaterConsumption,
          id?.toString() ??'', differenceBetweenPeriod, bankAccounts);
      const link =
        await generatePdf(
            id?.toString() ??'',
            HOUSING_COMPANIES + '/' + companyId + '/' +
            apartmentId + '/water_bills' +
             '/' + waterConsumption?.year +
             '/' + waterConsumption?.period +
            '.pdf',
        );
      const waterBillRef = admin.firestore().
          collection(HOUSING_COMPANIES).doc(companyId?.toString()).
          collection(APARTMENTS).doc(apartmentId?.toString()).
          collection(WATER_BILLS);
      const waterBillId = waterBillRef.doc().id;
      const invoiceValue =
          (((waterConsumption?.basic_fee ?? 0) /
            (company?.apartment_count ?? 1)) +
          ((waterConsumption?.price_per_cube ?? 0) * differenceBetweenPeriod)) *
          (1 +(company?.vat ?? 0));
      const waterBill = {
        id: waterBillId,
        url: link,
        consumption: differenceBetweenPeriod,
        housing_company_id: companyId,
        apartment_id: apartmentId,
        invoice_value: parseFloat(invoiceValue.toFixed(2)),
        currency_code: company?.currency_code ?? '',
        year: parseInt(waterConsumption?.year),
        period: parseInt(waterConsumption?.period),
        created_on: new Date().getTime(),
      };
      await waterBillRef.doc(waterBillId).set(waterBill);
      return waterBill;
    } catch (errors) {
      console.log(errors);
      return undefined;
    }
  };


const updateBillTemplate =
  async (
      company: Company,
      apartment: Apartment,
      waterConsumption: WaterConsumption,
      previousPeriodConsumption: WaterConsumption,
      templateId: string,
      differenceBetweenPeriod: number,
      bankAccounts?: BankAccount[]) => {
    const {google} = require('googleapis');
    const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

    const auth = new google.auth.GoogleAuth({
      scopes: SCOPES,
      keyFile: './service-account-key.json',
    });
    const client = await auth.getClient();
    const googleSheetInstance = google.sheets({version: 'v4', auth: client});
    const companyStreetAddress = company.street_address_1 ?? '' +
        ' ' + company.street_address_2 ?? '';
    const apartmentAddress =
      companyStreetAddress + ' ' +
      apartment.building + ' ' +
      (apartment.house_code ?? '');
    const companyPostalCity = (company.postal_code ?? '') + ' ' +
      (company.city ?? '');
    const data = [
      {
        range: 'I16',
        values: [[waterConsumption.basic_fee]],
      },
      {
        range: 'I15',
        values: [[waterConsumption.price_per_cube]],
      },
      {
        range: 'B2:G2',
        values: [[company.name ?? '']],
      },
      {
        range: 'B3:G3',
        values: [[companyStreetAddress]],
      },
      {
        range: 'B4:G4',
        values: [[companyPostalCity]],
      },
      {
        range: 'B9:G9',
        values: [[apartmentAddress]],
      },
      {
        range: 'B10:G10',
        values: [[companyPostalCity]],
      },
      {
        range: 'K5',
        values: [[
          'Water_' + waterConsumption.period.toString() + '_' +
          waterConsumption.year.toString() + '_' +
          apartment.building + (apartment.house_code ?? ''),
        ]],
      },
      {
        range: 'G15',
        values: [[differenceBetweenPeriod]],
      },
      {
        range: 'G16',
        values: [[1/(company.apartment_count??1)]],
      },
      {
        range: 'G37',
        values: [[previousPeriodConsumption.total_reading]],
      },
      {
        range: 'G38',
        values: [[waterConsumption.total_reading]],
      },
      {
        range: 'C47:D47',
        values: [[bankAccounts?.[0]?.swift ?? '']],
      },
      {
        range: 'E47:H47',
        values: [[bankAccounts?.[0]?.bank_account_number ?? '']],
      },
    ];
    // Additional ranges to update ...
    const resource = {
      data,
      valueInputOption: 'USER_ENTERED',
    };
    try {
      const result = await googleSheetInstance.spreadsheets.values.batchUpdate({
        spreadsheetId: templateId,
        resource,
      });
      return result;
    } catch (err) {
      console.log(err);
    }
  };

const generatePdf =
    async (templateId: string, fileName: string) => {
      try {
        const {google} = require('googleapis');
        const SCOPES = ['https://www.googleapis.com/auth/drive'];
        const auth = new google.auth.GoogleAuth({
          scopes: SCOPES,
          keyFile: './service-account-key.json',
        });
        const client = await auth.getClient();
        const googleDriveInstance = google.drive({version: 'v3', auth: client});
        const res = await googleDriveInstance.files.export(
            {fileId: templateId, mimeType: 'application/pdf', size: 'A4'},
            {responseType: 'stream'},
        );
        const gs = admin.storage().bucket().file(fileName).createWriteStream({
          resumable: false,
          validation: false,
          contentType: 'auto',
          metadata: {
            'Cache-Control': 'public, max-age=31536000'},
        });
        await res.data.pipe(gs);
        return fileName;
      } catch (errors) {
        console.log(errors);
      }
    };

export const getWaterBillLinkRequest =
    async (request: Request, response: Response) => {
      // @ts-ignore
      const userId = request.user?.uid;
      const waterBillId = request.query.water_bill_id;
      try {
        const waterBill = (await admin.firestore().collectionGroup(WATER_BILLS)
            .where('id', '==', waterBillId).limit(1).get())
            .docs.map((doc)=> doc.data())[0];
        const apartment = await isAuthorizedAccessToApartment(
            userId, waterBill.housing_company_id, waterBill.apartment_id);
        if (!apartment) {
          response.status(403).send(
              {errors: {message: 'Not tenant', code: 'not_tenant'}});
          return;
        }
        const link = await getPublicLinkForFile(waterBill.url);
        response.status(200).send({link: link});
      } catch (errors) {
        console.log(errors);
        response.status(500).send(
            {errors: errors});
      }
    };


