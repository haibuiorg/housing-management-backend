import {Request, Response} from 'express';
import {firestore} from 'firebase-admin';
import admin from 'firebase-admin';

export const addUserNotificationToken = async (req: Request, res: Response)=> {
  try {
    const userUid = req.user.uid;
    const newToken = [req.body.notification_tokens];
    await admin.firestore().collection('users').doc(userUid).
        update(
            {'notification_tokens':
            firestore.FieldValue.arrayUnion(...newToken)},
        );
    const newUser = (
      await admin.firestore().collection('users').doc(userUid).get()
    ).data();
    newUser!.email_verified = req.user.email_verified;
    res.status(200).send(newUser);
  } catch (errors) {
    res.status(500).send(errors);
  }
};

export const sendNotification = async (
    tokens: string[],
    collectRequestData: any,
    channelKey: string = 'default',
    title: string = 'Collect request status updated',
    body: string = 'Your collect request is now updated, check it out!') => {
  const content = {
    id: collectRequestData.collect_request_id,
    channelKey: channelKey,
    title: title,
    body: body,
    autoDismissible: true,
    color: 0xFF9D50DD,
    payload: collectRequestData,
  };
  const data: any = {};
  data.content = JSON.stringify(content);
  tokens = tokens.filter((n) => n);
  admin.messaging().sendToDevice(
      tokens,
      {
        data: data,
      },
      {
        priority: 'high',
        mutableContent: true,
        contentAvailable: true,
        colors: '#ACD6B6',
      },
  ).then((value) =>{
    console.log(value.results);
  }).catch((error) => {
    console.log(error);
  });
};
