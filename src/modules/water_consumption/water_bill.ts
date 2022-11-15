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
          where(YEAR, '==', year).
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

export const generateLatestWaterBill =
  async (
      userId: string,
      apartmentId:string,
      companyId: string) => {
    const currentTime = new Date().getTime();
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
      const folderId = company?.water_bill_shared_folder_id;
      await updateBillTemplate(
          company!,
          apartment as Apartment,
          waterConsumption as WaterConsumption,
          previousPeriodConsumption as WaterConsumption,
          id?.toString() ??'');
      const stream = await exportPdfStream(id?.toString() ??'');
      const link =
        await generatePdf(
            stream,
            apartment!.building.toString() +
             '_' + waterConsumption.year +
             '_' + waterConsumption.period +
             '_' + currentTime,
            folderId?.toString() ??'');
      const waterBillRef = admin.firestore().
          collection(HOUSING_COMPANIES).doc(companyId?.toString()).
          collection(APARTMENTS).doc(apartmentId?.toString()).
          collection(WATER_BILLS);
      const waterBillId = waterBillRef.doc().id;
      const waterBill = {
        id: waterBillId,
        url: link,
        year: parseInt(waterConsumption.year),
        period: parseInt(waterConsumption.period),
        created_on: new Date().getTime(),
      };
      await waterBillRef.doc(waterBillId).set(waterBill);
      return waterBill;
    } catch (errors) {
      return undefined;
    }
  };


const updateBillTemplate =
  async (
      company: Company,
      apartment: Apartment,
      waterConsumption: WaterConsumption,
      previousPeriodConsumption: WaterConsumption,
      templateId: string) => {
    const {google} = require('googleapis');
    const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
    const path = process.env.SERVICE_ACCOUNT_PATH;
    const auth = new google.auth.GoogleAuth({
      scopes: SCOPES,
      keyFile: path,
    });
    const client = await auth.getClient();
    const googleSheetInstance = google.sheets({version: 'v4', auth: client});
    const companyStreetAddress = company.street_address_1 ?? '' +
        ' ' + company.street_address_2 ?? '';
    const apartmentAddress =
      companyStreetAddress + ' ' +
      apartment.building + ' ' +
      (apartment.house_code ?? '');
    const consumption = waterConsumption
        .consumption_values?.
        find((value) => value.apartment_id === apartment.id)?.consumption ?? 0;
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
        values: [[consumption]],
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
      /* {
        range: 'C47:D47',
        values: [[company.bankAccounts?.[0].swift ?? '']],
      },
      {
        range: 'E47:H47',
        values: [[company.bankAccounts?.[0].bank_account_number ?? '']],
      },*/
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
      // TODO (Developer) - Handle exception
      throw err;
    }
  };

const exportPdfStream = async (templateId: string) => {
  const {google} = require('googleapis');
  const SCOPES = ['https://www.googleapis.com/auth/drive'];
  const path = process.env.SERVICE_ACCOUNT_PATH;
  const auth = new google.auth.GoogleAuth({
    scopes: SCOPES,
    keyFile: path,
  });
  const client = await auth.getClient();
  const googleDriveInstance = google.drive({version: 'v3', auth: client});
  const res = await googleDriveInstance.files.export(
      {fileId: templateId, mimeType: 'application/pdf', size: 'A4'},
      {responseType: 'stream'},
  );
  return res;
};

const generatePdf =async (stream:any, fileName: string, folderId: string) => {
  const {google} = require('googleapis');
  const SCOPES = ['https://www.googleapis.com/auth/drive'];
  const path = process.env.SERVICE_ACCOUNT_PATH;
  const auth = new google.auth.GoogleAuth({
    scopes: SCOPES,
    keyFile: path,
  });
  const client = await auth.getClient();
  const googleDriveInstance = google.drive({version: 'v3', auth: client});

  const media = {
    mimeType: 'application/pdf',
    body: stream.data,
  };
  const resCreate = await googleDriveInstance.files.create({
    uploadType: 'media',
    media: media,
    supportsAllDrives: true,
    resource: {
      'name': fileName + '.pdf',
      'parents': [folderId],
      'kind': 'drive#file',
      'mimeType': 'application/pdf'},
    fields: 'id,name',
  });
  return 'https://drive.google.com/file/d/' + resCreate.data.id + '/view';
};

