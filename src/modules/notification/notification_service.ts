import {Request, Response} from 'express';
import {firestore} from 'firebase-admin';
import admin from 'firebase-admin';
// eslint-disable-next-line max-len
import {APARTMENT, APP_COLOR, APP_NAME, CREATED_ON, HOUSING_COMPANIES, HOUSING_COMPANY, NOTIFICATION_MESSAGES, USERS}
  from '../../constants';
import {NotificationPayload} from '../../dto/notfication_payload';
// eslint-disable-next-line max-len
import {getCompanyData, getCompanyTenantIds} from '../housing/manage_housing_company';
import {User} from '../../dto/user';
// eslint-disable-next-line max-len
import {isCompanyManager, isCompanyTenant} from '../authentication/authentication';
import {NotificationChannel} from '../../dto/notification_channel';
import {MulticastMessage} from 'firebase-admin/lib/messaging/messaging-api';

export const addUserNotificationToken = async (req: Request, res: Response)=> {
  try {
    // @ts-ignore
    const userUid = req.user.uid;
    const newToken = [req.body.notification_tokens];
    await admin.firestore().collection(USERS).doc(userUid).
        update(
            {'notification_tokens':
            firestore.FieldValue.arrayUnion(...newToken)},
        );
    const newUser = (
      await admin.firestore().collection(USERS).doc(userUid).get()
    ).data();
    // @ts-ignore
    newUser!.email_verified = req.user.email_verified;
    res.status(200).send(newUser);
  } catch (errors) {
    res.status(500).send(errors);
  }
};

export const deleteNotificationToken =
  async (request: Request, response: Response) => {
    const token = request.body.token;
    if (!token) {
      response.status(500).send({'errors': 'Invalid token'});
      return;
    }
    // @ts-ignore
    const userId = request.user.uid;
    await admin.firestore().collection('users').doc(userId)
        .update({
          'notification_tokens': firestore.FieldValue.arrayRemove(token),
        });
    response.status(200).send({'result': true});
    return;
  };

export const getNotificationChannels =
  async (request: Request, response: Response) => {
    // @ts-ignore
    const userId = request.user?.uid;
    const companyId = request.query.housing_company_id?.toString() ?? '';
    if (await isCompanyTenant(userId, companyId)) {
      const company = await getCompanyData(companyId);
      response.status(200).send(company?.notification_channels);
      return;
    }
    response.status(403)
        .send({errors: {error: 'Not manager', code: 'not_manager'}});
  };

export const createNotificationChannels =
  async (request: Request, response: Response) => {
    // @ts-ignore
    const userId = request.user?.uid;
    const companyId = request.body.housing_company_id?.toString() ?? '';
    const company = await isCompanyManager(userId, companyId);
    if (company) {
      const channelKey = request.body.channel_key?.toString() ?? '';
      const channelName = request.body.channel_name?.toString() ?? '';
      const channelDescription =
        request.body.channel_description?.toString() ?? '';
      const notificationChannel : NotificationChannel = {
        channel_description: channelDescription,
        channel_key: channelKey,
        channel_name: channelName,
        is_active: true,
      };
      await admin.firestore().collection(HOUSING_COMPANIES).doc(companyId).
          update(
              {'notification_channels':
          firestore.FieldValue.arrayUnion(...[notificationChannel])},
          );
      response.status(200)
          .send(notificationChannel);
      return;
    }
    response.status(400)
        .send({errors: {error: 'Not manager', code: 'not_manager'}});
  };

export const deleteNotificationChannels =
  async (request: Request, response: Response) => {
    // @ts-ignore
    const userId = request.user?.uid;
    const companyId = request.body.housing_company_id?.toString() ?? '';
    const company = await isCompanyManager(userId, companyId);
    if (company) {
      const channelKey = request.body.channel_key?.toString() ?? '';
      const newChannels = company.notification_channels?.
          filter((channel) => channel.channel_key != channelKey);
      await admin.firestore().collection(HOUSING_COMPANIES).doc(companyId).
          update({'notification_channels': newChannels});
      company.notification_channels = newChannels;
      response.status(200)
          .send(company);
    }
    response.status(400)
        .send({errors: {error: 'Not manager', code: 'not_manager'}});
  };


export const sendNotificationToCompany = async (
    housingCompanyId: string,
    dataPayload?: NotificationPayload) => {
  const usersInCompany = await
  getCompanyTenantIds(housingCompanyId, true, true);
  sendNotificationToUsers(usersInCompany, dataPayload);
};

export const getUserNotificationToken =
 async (userIds: string[]) : Promise<string[]> => {
   const result:string[] = [];
   await Promise.all(userIds.map(async (id) => {
     try {
       const data = ((await admin.firestore()
           .collection(USERS).doc(id).get())
           .data() as User);
       if (data && data.is_active) {
         result.push(...data.notification_tokens ?? []);
       }
     } catch (error) {
       console.log(error);
     }
   }));
   return result.filter((element) => {
     return element !== '';
   });
 };

export const sendNotificationToUsers = async (
    userIds: string[],
    dataPayload?: NotificationPayload) => {
  const tokens = await getUserNotificationToken(userIds);
  await saveNotificationToUsers(userIds, dataPayload);
  sendNotification(tokens, dataPayload);
};

export const sendNotification = async (
    tokens: string[],
    prefillNotificationPayload?: NotificationPayload) => {
  const content = {
    id: prefillNotificationPayload?.id ?? '',
    channelKey: prefillNotificationPayload?.channel_key ?? 'default',
    title: prefillNotificationPayload?.title ?? APP_NAME,
    body: prefillNotificationPayload?.body ?? 'Check this out!',
    autoDismissible: prefillNotificationPayload?.auto_dismissible ?? true,
    color: prefillNotificationPayload?.color ?? APP_COLOR,
    payload: prefillNotificationPayload,
    wakeUpScreen: prefillNotificationPayload?.wake_up_screen ?? true,
    sound: 'default',
  };
  const data: any = {};
  data.content = JSON.stringify(content);
  tokens = tokens.filter((n) => n);
  const message:MulticastMessage = {
    data: data,
    tokens: tokens,
    apns: {
      payload: {
        aps: {
          sound: 'default',
          alert: {
            title: prefillNotificationPayload?.title ?? APP_NAME,
            body: prefillNotificationPayload?.body ?? 'Check this out!',
          },
          contentAvailable: true,

        },
      },
    },
  };
  admin.messaging().sendMulticast(message);
  /* admin.messaging().sendToDevice(
      tokens,
      {
        data: data,
      },
      {
        priority: 'high',
        mutableContent: true,
        contentAvailable: true,
        colors: prefillNotificationPayload?.color ?? APP_COLOR,
      },
  ).then((value) =>{
    console.log(value.results);
  }).catch((error) => {
    console.log(error);
  });*/
};

const saveNotificationToUsers = async ( userIds: string[],
    dataPayload?: NotificationPayload) => {
  const prefillNotificationPayload: NotificationPayload = {
    id: dataPayload?.id ?? '',
    channel_key: dataPayload?.channel_key ?? 'default',
    title: dataPayload?.title ?? APP_NAME,
    body: dataPayload?.body ?? 'Check this out',
    auto_dismissible: dataPayload?.auto_dismissible ?? true,
    color: dataPayload?.color ?? APP_COLOR,
    wake_up_screen: dataPayload?.wake_up_screen ?? true,
    app_route_location: dataPayload?.app_route_location ?? '/',
    created_by: dataPayload?.created_by ?? '',
    display_name: dataPayload?.display_name ?? '',
    seen: dataPayload?.seen ?? false,
    created_on: dataPayload?.created_on ?? new Date().getTime(),
  };
  await Promise.all(userIds.map(async (id) => {
    try {
      const notificationId = admin.firestore()
          .collection(USERS).doc(id).collection(NOTIFICATION_MESSAGES).doc().id;
      prefillNotificationPayload.id = notificationId;
      await admin.firestore()
          .collection(USERS).doc(id).collection(NOTIFICATION_MESSAGES)
          .doc(notificationId).set(prefillNotificationPayload);
    } catch (error) {
      console.log(error);
    }
  }));
};

export const getNotificationMessages =
  async (request:Request, response: Response) => {
  // @ts-ignore
    const userId = request.user?.uid;
    const lastMessageTime =
        parseInt(request.query.last_message_time?.toString() ??
        new Date().getTime().toString());
    const total = parseInt(request.query.total?.toString() ?? '10');
    try {
      const notificationMessages = (await admin.firestore()
          .collection(USERS).doc(userId).collection(NOTIFICATION_MESSAGES)
          .orderBy(CREATED_ON).endBefore(lastMessageTime).limit(total)
          .get()).docs.map((doc) => doc.data());
      response.status(200).send(notificationMessages);
    } catch (errors) {
      console.log(errors);
      response.status(500).send({errors: errors});
    }
  };

export const setNotificationMessageSeen =
  async (request:Request, response: Response) => {
  // @ts-ignore
    const userId = request.user?.uid;
    const notificationId = request.body.notification_id?.toString() ?? '';
    try {
      await admin.firestore()
          .collection(USERS).doc(userId).collection(NOTIFICATION_MESSAGES)
          .doc(notificationId).update({seen: true});
      response.status(200).send({result: true});
    } catch (errors) {
      console.log(errors);
      response.status(500).send({errors: errors});
    }
  };

export const sendNotificationTest =
 async (request: Request, response: Response) => {
   // eslint-disable-next-line max-len
   await sendNotification(['cAv1MyFVQVaU04MZ_4nlaX:APA91bGJbC7zW0Lod4k2cBdUKiNKv-LzsgS2X3anuz_3TC9RIaWbzgzUJy6VQJzY-yHZe5f7vqjIdejo55ukLmEquBD9GvEIelgi-KZFe2YPzbDnH67MQlkdHzpvHoNe7GJMXa24hKly', 'e77Y5Xj1YkcVtmh0bed7w7:APA91bE9vBEKZT1RPJdHt0gIsnL1Hu_MMKq1DaiwSj7VsAsupyTjTcmbwnqknzGKaPLeYOxYh3X0de_DOOqzLhXFJPwhkyp7QBikkUjXfnir8UTpabv80BPbUVntr9ldtym_whl7qax9'],
       {app_route_location: '/' + HOUSING_COMPANY + '/' +
      'tDkWpFZ2yJzEcJpKeQMT' + '/' + APARTMENT + '/' + 'NNs1Kirr8NnYYEAKb3CQ'});
   response.end();
 };
