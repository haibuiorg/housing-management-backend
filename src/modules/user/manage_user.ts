import {Request, Response} from 'express';
import admin from 'firebase-admin';
import {USERS} from '../../constants';

export const getUserData = async (request: Request, response: Response) => {
  // @ts-ignore
  const userId = request.user.uid;
  const user = await retrieveUser(userId);
  if (user) {
    response.status(200).send(user);
    return;
  }
  response.status(403)
      .send({errors: {error: 'User data deleted', code: 'user_data_deleted'}});
};

export const retrieveUser = async (userId: string) => {
  return (await admin.firestore().collection(USERS).doc(userId).get()).data();
};
