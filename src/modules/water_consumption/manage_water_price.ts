import {Request, Response} from 'express';
import {WaterPrice} from '../../dto/water_price';
import admin from 'firebase-admin';
// eslint-disable-next-line max-len
import {HOUSING_COMPANIES, WATER_PRICE, IS_ACTIVE, UPDATED_ON, HOUSING_COMPANY, WATER_CONSUMPTION_MANAGEMENT, DEFAULT}
  from '../../constants';
import {isCompanyManager, isCompanyTenant}
  from '../authentication/authentication';
import {sendTopicNotification} from '../notification/notification_service';
import {getUserDisplayName} from '../user/manage_user';

export const addNewWaterPrice = async (request:Request, response: Response) => {
  const companyId = request.body.housing_company_id;
  // @ts-ignore
  const userId = request.user?.uid;
  const company = await(isCompanyManager(userId, companyId));
  if (company) {
    const waterPriceId = admin.firestore()
        .collection(HOUSING_COMPANIES).doc(companyId)
        .collection(WATER_PRICE).doc().id;
    const basicFee = request.body.basic_fee ?? 0;
    const pricePerCube = request.body.price_per_cube ?? 0;
    const waterPrice : WaterPrice = {
      basic_fee: basicFee,
      price_per_cube: pricePerCube,
      is_active: true,
      id: waterPriceId,
      updated_on: new Date().getTime(),
    };
    try {
      const distplayName = await getUserDisplayName(userId, companyId);
      await admin.firestore()
          .collection(HOUSING_COMPANIES).doc(companyId)
          .collection(WATER_PRICE).doc(waterPriceId).set(waterPrice);
      // TODO: create notification channels/topics
      await sendTopicNotification(DEFAULT, {
        created_by: userId,
        display_name: distplayName,
        // eslint-disable-next-line max-len
        body: 'New water price updated, now total basic fee is: ' + basicFee + company.currency_code?.toUpperCase() + ' and price per cube is: ' + pricePerCube + company.currency_code?.toUpperCase(),
        app_route_location: '/' + HOUSING_COMPANY + '/' + companyId +
         '/' + WATER_CONSUMPTION_MANAGEMENT,
        title: 'New water price',
        color: company?.ui?.seed_color,
      });
      response.status(200).send(waterPrice);
    } catch (errors) {
      response.status(500).send({errors: errors});
    }
    return;
  }
  response.status(403).send(
      {errors: {error: 'Unauthorized', code: 'not_manager'}},
  );
};

export const deleteWaterPrice = async (request:Request, response: Response) => {
  const companyId = request.body.housing_company_id;
  // @ts-ignore
  const userId = request.user?.uid;
  const waterPriceId = request.body.id;
  if (await(isCompanyManager(userId, companyId)) && waterPriceId) {
    const waterPrice : WaterPrice = {
      is_active: false,
      updated_on: new Date().getTime(),
      id: waterPriceId,
    };
    try {
      await admin.firestore()
          .collection(HOUSING_COMPANIES).doc(companyId)
          .collection(WATER_PRICE).doc(waterPriceId).update(waterPrice);
      response.status(200).send(waterPrice);
    } catch (errors) {
      response.status(500).send({errors: errors});
    }
    return;
  }
  response.status(403).send(
      {errors: {error: 'Unauthorized', code: 'not_manager'}},
  );
};

export const getActiveWaterPriceRequest =
    async (request:Request, response: Response) => {
      const companyId = request.query.housing_company_id;
      // @ts-ignore
      const userId = request.user?.uid;
      if (companyId &&
        (await(isCompanyTenant(userId, companyId.toString())) ||
            await(isCompanyManager(userId, companyId.toString()))
        )) {
        try {
          const isHistory = request.query.is_history;
          if (isHistory) {
            const waterPrice = await getWaterPriceHistory(companyId.toString());
            response.status(200).send(waterPrice);
            return;
          }
          const waterPrice = await getActiveWaterPrice(companyId.toString());
          response.status(200).send(waterPrice);
        } catch (errors) {
          response.status(500).send({errors: errors});
        }
        return;
      }
      response.status(403).send(
          {errors: {error: 'Unauthorized', code: 'not_tenant'}},
      );
    };
export const getActiveWaterPrice =
    async (companyId: string) => {
      const waterPrices = (await admin.firestore()
          .collection(HOUSING_COMPANIES).doc(companyId.toString())
          .collection(WATER_PRICE).where(IS_ACTIVE, '==', true)
          .orderBy(UPDATED_ON, 'desc').limit(1).get())
          .docs.map((doc) => doc.data());
      return waterPrices[0];
    };

export const getWaterPriceHistory =
    async (companyId: string) => {
      const waterPrices = (await admin.firestore()
          .collection(HOUSING_COMPANIES).doc(companyId.toString())
          .collection(WATER_PRICE).orderBy(UPDATED_ON, 'asc').get())
          .docs.map((doc) => doc.data());
      return waterPrices;
    };
