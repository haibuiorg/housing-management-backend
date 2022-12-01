import {Request, Response} from 'express';
import {firestore} from 'firebase-admin';
import admin from 'firebase-admin';
// eslint-disable-next-line max-len
import {APARTMENT, APP_COLOR, APP_NAME, CREATED_ON, DEFAULT, HOUSING_COMPANIES, HOUSING_COMPANY, IS_VALID, NOTIFICATION_MESSAGES, NOTIFICATION_TOKENS, TOKEN, USERS}
  from '../../constants';
import {NotificationPayload} from '../../dto/notfication_payload';
// eslint-disable-next-line max-len
import {getCompanyData, getCompanyTenantIds} from '../housing/manage_housing_company';
// eslint-disable-next-line max-len
import {isCompanyManager, isCompanyTenant} from '../authentication/authentication';
import {NotificationChannel} from '../../dto/notification_channel';
import {MulticastMessage} from 'firebase-admin/lib/messaging/messaging-api';
import {NotificationToken} from '../../dto/notification_token';

export const addUserNotificationToken = async (req: Request, res: Response)=> {
  try {
    // @ts-ignore
    const userUid = req.user.uid;
    const newToken = req.body.notification_token;
    const tokenExist = (await admin.firestore()
        .collection(USERS).doc(userUid)
        .collection(NOTIFICATION_TOKENS)
        .where(TOKEN, '==', newToken).count().get()).data().count > 0;
    if (tokenExist) {
      const newUser = (
        await admin.firestore().collection(USERS).doc(userUid).get()
      ).data();
      // @ts-ignore
      newUser!.email_verified = req.user.email_verified;
      res.status(200).send(newUser);
      return;
    }
    const tokenId = admin.firestore().collection(USERS)
        .doc(userUid).collection(NOTIFICATION_TOKENS).doc().id;
    const notificationToken: NotificationToken = {
      is_valid: true,
      token: newToken,
      channels: [],
      id: tokenId,
      user_id: userUid,
    };
    await admin.firestore().collection(USERS).doc(userUid)
        .collection(NOTIFICATION_TOKENS).doc(tokenId).set(notificationToken);
    subscribeOrUnsubscribeToChannels(userUid, newToken, [DEFAULT]);
    const newUser = (
      await admin.firestore().collection(USERS).doc(userUid).get()
    ).data();
    // @ts-ignore
    newUser!.email_verified = req.user.email_verified;
    res.status(200).send(newUser);
  } catch (errors) {
    console.error(errors);
    res.status(500).send(errors);
  }
};

export const deleteNotificationToken =
  async (request: Request, response: Response) => {
    const token = request.body.notification_token;
    if (!token) {
      response.status(500).send({'errors': 'Invalid token'});
      return;
    }
    // @ts-ignore
    const userId = request.user.uid;
    const tokenId = (await admin.firestore()
        .collection(USERS).doc(userId)
        .collection(NOTIFICATION_TOKENS)
        .where(TOKEN, '==', token).get()).docs.map((doc) => doc.data().id);
    await Promise.all(tokenId.map(async (id) => {
      try {
        (await admin.firestore()
            .collection(USERS).doc(userId)
            .collection(NOTIFICATION_TOKENS).doc(id).update({IS_VALID: false}));
      } catch (error) {
        console.log(error);
      }
    }));
    response.status(200).send({'result': true});
    return;
  };

export const getCompanyNotificationChannels =
  async (request: Request, response: Response) => {
    // @ts-ignore
    const userId = request.user?.uid;
    const companyId = request.query.housing_company_id?.toString() ?? '';
    const currentToken = request.query.current_notification_token;
    if (await isCompanyTenant(userId, companyId)) {
      const company = await getCompanyData(companyId);
      const tokenChannels: string[] = [];
      (await admin.firestore()
          .collection(USERS).doc(userId)
          .collection(NOTIFICATION_TOKENS)
          .where(TOKEN, '==', currentToken)
          .where(IS_VALID, '==', true).get())
          .docs.forEach((doc) => tokenChannels.push(...doc.data().channels));
      const notificationChannels = company?.notification_channels
          ?.map((channel) => {
            channel.is_subscribed = tokenChannels.includes(channel.channel_key);
            return channel;
          });
      response.status(200).send(notificationChannels);
      return;
    }
    response.status(403)
        .send({errors: {error: 'Not tenant', code: 'not_tenant'}});
  };

export const createNotificationChannels =
  async (request: Request, response: Response) => {
    // @ts-ignore
    const userId = request.user?.uid;
    const companyId = request.body.housing_company_id?.toString() ?? '';
    const company = await isCompanyManager(userId, companyId);
    if (company) {
      const channelName = request.body.channel_name?.toString() ?? '';
      const channelDescription =
        request.body.channel_description?.toString() ?? '';
      const notificationChannel : NotificationChannel = {
        channel_description: channelDescription,
        channel_key: companyId + '_' + new Date().getTime(),
        channel_name: channelName,
        housing_company_id: companyId,
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
    response.status(403)
        .send({errors: {error: 'Not manager', code: 'not_manager'}});
  };

export const subscribeNotificationChannels =
  async (request: Request, response: Response) => {
    // @ts-ignore
    const userId = request.user?.uid;
    const subscribedChannels: string[] = request.body.subscribed_channel_keys;
    const unsubscribedChannels: string[] =
        request.body.unsubscribed_channel_keys;
    const userToken = request.body.notification_token?.toString() ?? '';
    try {
      await subscribeOrUnsubscribeToChannels(
          userId, userToken, subscribedChannels, unsubscribedChannels,
      );
    } catch (errors) {
      console.error(errors);
      response.status(500)
          .send({errors: errors});
      return;
    }
    response.status(200)
        .send({result: true});
  };

const subscribeOrUnsubscribeToChannels =
    async (
        userId: string,
        userToken: string,
        subscribedChannels:string [],
        unsubscribedChannels: string[] = []) => {
      const tokenId = (await admin.firestore()
          .collection(USERS).doc(userId)
          .collection(NOTIFICATION_TOKENS)
          .where(TOKEN, '==', userToken).get())
          .docs.map((doc) => doc.data().id);
      await Promise.all(tokenId.map(async (id) => {
        try {
          (await admin.firestore()
              .collection(USERS).doc(userId)
              .collection(NOTIFICATION_TOKENS).doc(id)
              .update(
                  {
                    channels:
                    firestore.FieldValue.arrayUnion(...subscribedChannels),
                  },
              ));
          (await admin.firestore()
              .collection(USERS).doc(userId)
              .collection(NOTIFICATION_TOKENS).doc(id)
              .update(
                  {
                    channels:
                    firestore.FieldValue.arrayRemove(unsubscribedChannels),
                  },
              ));
        } catch (error) {
          console.log(error);
        }
      },
      ));
      if (subscribedChannels.length> 0) {
        await Promise.all(subscribedChannels.map(async (channel) => {
          await admin.messaging().subscribeToTopic(userToken, channel);
        }));
      }
      if (unsubscribedChannels.length> 0) {
        await Promise.all(unsubscribedChannels.map(async (channel) => {
          await admin.messaging().unsubscribeFromTopic(userToken, channel);
        }));
      }
    };

export const deleteCompanyNotificationChannels =
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
      response.status(200)
          .send(newChannels);
    }
    response.status(403)
        .send({errors: {error: 'Not manager', code: 'not_manager'}});
  };


export const sendNotificationToCompany =
 async (
     housingCompanyId: string,
     dataPayload?: NotificationPayload) => {
   const usersInCompany =
      await getCompanyTenantIds(housingCompanyId, true, true);
   sendNotificationToUsers(usersInCompany, dataPayload);
 };

export const getUserNotificationToken =
 async (userIds: string[]) : Promise<string[]> => {
   const result:string[] = [];
   await Promise.all(userIds.map(async (id) => {
     try {
       const tokens = ((await admin.firestore()
           .collection(USERS).doc(id)
           .collection(NOTIFICATION_TOKENS)
           .where(IS_VALID, '==', true).get())
           .docs.map((doc) => doc.data().token));
       result.push(...tokens ?? []);
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
  sendTokenNotification(tokens, dataPayload);
};

export const sendTopicNotification = async (
    channelKey: string,
    prefillNotificationPayload?: NotificationPayload) => {
  const content = {
    id: prefillNotificationPayload?.id ?? '',
    channelKey: prefillNotificationPayload?.channel_key ?? DEFAULT,
    title: prefillNotificationPayload?.title ?? APP_NAME,
    body: prefillNotificationPayload?.body ?? 'Check this out!',
    autoDismissible: prefillNotificationPayload?.auto_dismissible ?? true,
    color: prefillNotificationPayload?.color ?? APP_COLOR,
    payload: prefillNotificationPayload,
    wakeUpScreen: prefillNotificationPayload?.wake_up_screen ?? true,
    sound: DEFAULT,
  };
  const data: any = {};
  data.content = JSON.stringify(content);
  const userIds = await getUserIdsSubscribeToTopicChannel(channelKey);
  saveNotificationToUsers(userIds, prefillNotificationPayload);
  admin.messaging().sendToTopic(channelKey,
      {
        notification: {
          title: prefillNotificationPayload?.title ?? APP_NAME,
          body: prefillNotificationPayload?.body ?? 'Check this out!',
          color: prefillNotificationPayload?.color ?? APP_COLOR,
          sound: DEFAULT,
        },
        data: data,
      },
      {
        priority: 'high',
        mutableContent: true,
        contentAvailable: true,
        colors: prefillNotificationPayload?.color ?? APP_COLOR,
      });
};

const getUserIdsSubscribeToTopicChannel =
  async (channelKey: string) : Promise<string[]> => {
    try {
      const userIds = (await admin.firestore()
          .collectionGroup(NOTIFICATION_TOKENS)
          .where('channels', 'array-contains', channelKey)
          .get()).docs.map((doc) => doc.data().user_id);
      return [...new Set(userIds)];
    } catch (errors) {
      console.error(errors);
      return [];
    }
  };


export const sendTokenNotification = async (
    tokens: string[],
    prefillNotificationPayload?: NotificationPayload) => {
  const content = {
    id: prefillNotificationPayload?.id ?? '',
    channelKey: prefillNotificationPayload?.channel_key ?? DEFAULT,
    title: prefillNotificationPayload?.title ?? APP_NAME,
    body: prefillNotificationPayload?.body ?? 'Check this out!',
    autoDismissible: prefillNotificationPayload?.auto_dismissible ?? true,
    color: prefillNotificationPayload?.color ?? APP_COLOR,
    payload: prefillNotificationPayload,
    wakeUpScreen: prefillNotificationPayload?.wake_up_screen ?? true,
    sound: DEFAULT,
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
          sound: DEFAULT,
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

const saveNotificationToUsers = async (userIds: string[],
    dataPayload?: NotificationPayload) => {
  const prefillNotificationPayload: NotificationPayload = {
    id: dataPayload?.id ?? '',
    channel_key: dataPayload?.channel_key ?? DEFAULT,
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
  await Promise.all([...new Set(userIds)].map(async (id) => {
    try {
      const notificationId = admin.firestore()
          .collection(USERS).doc(id).collection(NOTIFICATION_MESSAGES).doc().id;
      prefillNotificationPayload.id = notificationId;
      await admin.firestore()
          .collection(USERS).doc(id).collection(NOTIFICATION_MESSAGES)
          .doc(notificationId).set(prefillNotificationPayload);
    } catch (error) {
      console.error(error);
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
          .orderBy(CREATED_ON, 'desc').startAfter(lastMessageTime).limit(total)
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
    const notificationId =
        request.body.notification_message_id?.toString() ?? '';
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
   /*  await sendNotification(['cAv1MyFVQVaU04MZ_4nlaX:APA91bGJbC7zW0Lod4k2cBdUKiNKv-LzsgS2X3anuz_3TC9RIaWbzgzUJy6VQJzY-yHZe5f7vqjIdejo55ukLmEquBD9GvEIelgi-KZFe2YPzbDnH67MQlkdHzpvHoNe7GJMXa24hKly', 'e77Y5Xj1YkcVtmh0bed7w7:APA91bE9vBEKZT1RPJdHt0gIsnL1Hu_MMKq1DaiwSj7VsAsupyTjTcmbwnqknzGKaPLeYOxYh3X0de_DOOqzLhXFJPwhkyp7QBikkUjXfnir8UTpabv80BPbUVntr9ldtym_whl7qax9'],
       {app_route_location: '/' + HOUSING_COMPANY + '/' +
      'tDkWpFZ2yJzEcJpKeQMT' + '/' + APARTMENT + '/' + 'NNs1Kirr8NnYYEAKb3CQ'});
      */
   await sendTopicNotification(DEFAULT,
       {app_route_location: '/' + HOUSING_COMPANY + '/' +
    'tDkWpFZ2yJzEcJpKeQMT' + '/' + APARTMENT + '/' + 'NNs1Kirr8NnYYEAKb3CQ'});
   response.end();
 };
