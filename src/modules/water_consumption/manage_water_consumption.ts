import {Request, Response} from 'express';
import {WaterConsumption} from '../../dto/water_consumption';
import {getActiveWaterPrice} from './manage_water_price';
import admin from 'firebase-admin';
// eslint-disable-next-line max-len
import {CONSUMPTION_VALUE, DEFAULT, HOUSING_COMPANIES, HOUSING_COMPANY, PERIOD, WATER_CONSUMPTION, YEAR}
  from '../../constants';
import {getUserApartment, isApartmentTenant}
  from '../housing/manage_apartment';
import {ConsumptionValue} from '../../dto/consumption_value';
import {generateLatestWaterBill} from './water_bill';
import {isCompanyManager} from '../authentication/authentication';
import {Apartment} from '../../dto/apartment';
import {sendTopicNotification}
  from '../notification/notification_service';
import {Company} from '../../dto/company';
import {getUserDisplayName} from '../user/manage_user';

export const startNewWaterConsumptionPeriod =
    async (request:Request, response: Response) => {
      // @ts-ignore
      const userId = request.user?.uid;
      const companyId = request.body.housing_company_id;
      const totalReading = request.body.total_reading;
      if (!totalReading) {
        response.status(500).send(
            {errors: {error: 'Missing value', code: 'no_total_reading'}},
        );
      }
      const company = await isCompanyManager(userId, companyId);
      if (company as Company) {
        const activeWaterPrice = await getActiveWaterPrice(companyId);
        const waterConsumptionId = admin.firestore()
            .collection(HOUSING_COMPANIES).doc(companyId)
            .collection(WATER_CONSUMPTION).doc().id;
        const currentYear = new Date().getUTCFullYear();
        const previousPeriod =
            await getPreviousConsumptionPeriod(companyId, currentYear);
        const waterConsumption : WaterConsumption = {
          year: currentYear,
          basic_fee: activeWaterPrice.basic_fee,
          id: waterConsumptionId,
          period: previousPeriod + 1,
          price_id: activeWaterPrice.id,
          price_per_cube: activeWaterPrice.price_per_cube,
          total_reading: totalReading,
          created_on: new Date().getTime(),
        };
        await admin.firestore()
            .collection(HOUSING_COMPANIES).doc(companyId)
            .collection(WATER_CONSUMPTION)
            .doc(waterConsumptionId).set(waterConsumption);
        const distplayName = await getUserDisplayName(userId, companyId);
        // TODO: create notification channels/topics
        await sendTopicNotification(DEFAULT, {
          created_by: userId,
          display_name: distplayName,
          // eslint-disable-next-line max-len
          body: 'New water report period has started, you can now go to your apartment and report new water value',
          app_route_location: '/' + HOUSING_COMPANY + '/' + companyId,
          title: 'Water consumption',
          color: company?.ui?.seed_color,
        });
        response.status(200).send(waterConsumption);
        return;
      }
      response.status(403).send(
          {errors: {error: 'Unauthorized', code: 'not_manager'}},
      );
    };

export const addConsumptionValue =
    async (request:Request, response: Response) => {
      const waterConsumptionId = request.body.water_consumption_id;
      const housingCompanyId = request.body.housing_company_id;
      const apartmentId = request.body.apartment_id;
      // @ts-ignore
      const userId = request.user?.uid;
      const consumption = request.body.consumption;
      const building = request.body.building;
      const houseCode = request.body.house_code;
      if (!waterConsumptionId ||
         !housingCompanyId ||
         !consumption ||
         !building) {
        response.status(500).send({
          errors: {error: 'Missing value', code: 'missing_required_post_value',
          }});
      }
      let apartment: Apartment;
      if (apartmentId) {
        apartment = await getUserApartment(
            userId, housingCompanyId, apartmentId) as Apartment;
      } else {
        apartment = await isApartmentTenant(
            userId, housingCompanyId, building, houseCode) as Apartment;
      }
      if (apartment) {
        const consumptionValue: ConsumptionValue = {
          building: building,
          consumption: consumption,
          updated_on: new Date().getTime(),
          apartment_id: apartment.id ?? '',
        };
        if (houseCode) {
          consumptionValue.house_code = houseCode;
        }
        try {
          await admin.firestore()
              .collection(HOUSING_COMPANIES).doc(housingCompanyId)
              .collection(WATER_CONSUMPTION).doc(waterConsumptionId)
              .collection(CONSUMPTION_VALUE).doc(apartment.id ?? '')
              .set(consumptionValue);
          const waterBill = await generateLatestWaterBill(userId,
              apartment.id ?? '', housingCompanyId, consumption);
          response.status(200).send(waterBill);
        } catch (errors) {
          console.log(errors);
          response.status(500).send({errors: errors});
        }
        return;
      }
      response.status(403).send({errors: {
        error: 'Unauthorized',
        code: 'not_tenant',
      }});
    };

export const getWholeYearWaterConsumptionRequest =
   async (request:Request, response: Response) => {
     const companyId = request.query.housing_company_id;
     const year = request.query.year ?? new Date().getUTCFullYear();
     if (!companyId) {
       response.status(403).send({errors: {
         error: 'Missing value',
         code: 'missing_query_params',
       }});
       return;
     }
     try {
       const waterConsumptions =
        await getWholeYearWaterConsumptions(
            companyId!.toString(), parseInt(year.toString()));
       response.status(200).send(waterConsumptions);
     } catch (errors) {
       console.log(errors);
       response.status(500).send({errors: errors});
     }
   };


const getWholeYearWaterConsumptions =
    async (companyId: string, year: number) => {
      const waterConsumption = (await admin.firestore()
          .collection(HOUSING_COMPANIES).doc(companyId)
          .collection(WATER_CONSUMPTION)
          .where(YEAR, '==', year)
          .orderBy(PERIOD, 'asc')
          .get()).docs.map((doc) => doc.data());
      return waterConsumption;
    };

export const getLatestWaterConsumptionRequest =
    async (request:Request, response: Response) => {
      const companyId = request.query.housing_company_id;
      if (!companyId) {
        response.status(403).send({errors: {
          error: 'Missing value',
          code: 'missing_query_params',
        }});
        return;
      }
      try {
        const waterConsumption =
         await getLatestWaterConsumption(
             companyId!.toString());
        response.status(200).send(waterConsumption);
      } catch (errors) {
        console.log(errors);
        response.status(500).send({errors: errors});
      }
    };

export const getLatestWaterConsumption = async (companyId: string) => {
  const year = new Date().getUTCFullYear();
  const waterConsumption = (await admin.firestore()
      .collection(HOUSING_COMPANIES).doc(companyId)
      .collection(WATER_CONSUMPTION)
      .where(YEAR, '==', year)
      .orderBy(PERIOD, 'desc')
      .limit(1).get()).docs.map((doc) => doc.data())[0];
  const consumptionValues =
      await getAllConsumptionValue(companyId, waterConsumption.id);
  waterConsumption.consumption_values = consumptionValues;
  return waterConsumption;
};

export const getPreviousWaterConsumptionRequest =
    async (request:Request, response: Response) => {
      const companyId = request.query.housing_company_id;
      if (!companyId) {
        response.status(403).send({errors: {
          error: 'Missing value',
          code: 'missing_query_params',
        }});
        return;
      }
      try {
        const waterConsumption =
         await getPreviousWaterConsumption(
             companyId!.toString());
        response.status(200).send(waterConsumption);
      } catch (errors) {
        console.log(errors);
        response.status(500).send({errors: errors});
      }
    };

export const getPreviousWaterConsumption = async (companyId: string) => {
  let year = new Date().getUTCFullYear();
  const previousPeriod = await getPreviousConsumptionPeriod(companyId, year);
  if (previousPeriod === 0) {
    year = year-1;
  }
  const waterConsumption = (await admin.firestore()
      .collection(HOUSING_COMPANIES).doc(companyId)
      .collection(WATER_CONSUMPTION)
      .where(YEAR, '==', year)
      .orderBy(PERIOD, 'desc')
      .limit(1).get()).docs.map((doc) => doc.data())[0];
  return waterConsumption;
};

export const getWaterConsumptionRequest =
    async (request:Request, response: Response) => {
      const companyId = request.query.housing_company_id;
      const period = request.query.period;
      const year = request.query.year;
      if (!companyId || !period || !year) {
        response.status(403).send({errors: {
          error: 'Missing value',
          code: 'missing_query_params',
        }});
        return;
      }
      try {
        const waterConsumption =
         await getWaterConsumption(
             companyId!.toString(),
             parseInt(period.toString()),
             parseInt(year.toString()));
        response.status(200).send(waterConsumption);
      } catch (errors) {
        console.log(errors);
        response.status(500).send({errors: errors});
      }
    };

export const getWaterConsumption =
    async (companyId: string, period:number, year: number) => {
      const waterConsumption = (await admin.firestore()
          .collection(HOUSING_COMPANIES).doc(companyId)
          .collection(WATER_CONSUMPTION)
          .where(YEAR, '==', year)
          .where(PERIOD, '==', period)
          .limit(1).get()).docs.map((doc) => doc.data())[0];
      const consumptionValues =
            await getAllConsumptionValue(companyId, waterConsumption.id);
      waterConsumption.consumption_values = consumptionValues;
      return waterConsumption;
    };

// TODO: improve this to reduce cost if needed
const getAllConsumptionValue =
    async (companyId: string, waterConsumptionId: string) => {
      const waterConsumptionValues = (await admin.firestore()
          .collection(HOUSING_COMPANIES).doc(companyId)
          .collection(WATER_CONSUMPTION).doc(waterConsumptionId)
          .collection(CONSUMPTION_VALUE).listDocuments());
      const result: (admin.firestore.DocumentData | undefined)[] = [];
      await Promise.all(waterConsumptionValues.map(async (value) => {
        const data = (await value.get()).data();
        result.push(data);
      }));
      return result;
    };

const getPreviousConsumptionPeriod =
    async (companyId:string, year: number) : Promise<number> => {
      const previousPeriod = (await admin.firestore()
          .collection(HOUSING_COMPANIES).doc(companyId)
          .collection(WATER_CONSUMPTION)
          .where(YEAR, '==', year).orderBy(PERIOD, 'desc').limit(1).get())
          .docs.map((doc) => doc.data());
      return previousPeriod[0]?.period ?? 0;
    };
