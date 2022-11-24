import {Request, Response} from 'express';
import admin, {firestore} from 'firebase-admin';
import {COMPANY_MANAGER, HOUSING_COMPANIES, USERS} from '../../constants';
import {User} from '../../dto/user';
import {isCompanyManager} from '../authentication/authentication';

export const getUserData = async (request: Request, response: Response) => {
  // @ts-ignore
  const userId = request.user.uid;
  const user = await retrieveUser(userId);
  if (user) {
    if (!user.email_verified) {
      user.email_verified = await checkUserEmailVerificationStatus(request);
    }
    response.status(200).send(user);
    return;
  }
  response.status(403)
      .send({errors: {error: 'User data deleted', code: 'user_data_deleted'}});
};

export const updateUserData = async (request: Request, response: Response) => {
  // @ts-ignore
  const userId = request.user.uid;
  const firstName = request.body.first_name;
  const lastName = request.body.last_name;
  const phone = request.body.phone;

  const updateField = {};
  if (firstName) {
    // @ts-ignore
    updateField.first_name = firstName;
  }
  if (lastName) {
    // @ts-ignore
    updateField.last_name = lastName;
  }
  if (phone) {
    // @ts-ignore
    updateField.phone = phone;
  }
  try {
    await admin.firestore().collection(USERS).doc(userId).update(updateField);
    const user = await retrieveUser(userId);
    response.status(200).send(user);
  } catch (errors) {
    response.status(500).send({errors: errors});
  }
};

const checkUserEmailVerificationStatus = async (request: Request) :
  Promise<boolean> => {
  // @ts-ignore
  const emailVerified = request.user?.emailVerified;
  // @ts-ignore
  const userId = request.user?.uid;
  await admin.firestore().collection(USERS).doc(userId)
      .update({email_verified: emailVerified});
  return emailVerified;
};

export const addHousingCompanyToUser =
  async (companyId: string, userId: string) => {
    await admin.firestore().collection(USERS).doc(userId)
        .update(
            {[HOUSING_COMPANIES]: firestore.FieldValue.arrayUnion(companyId)},
        );
  };

export const getUserDisplayName =async (userId: string, companyId: string) => {
  const user = (await retrieveUser(userId) as User);
  if (user.first_name.length === 0 && user.last_name.length === 0) {
    if (await isCompanyManager(userId, companyId)) {
      return COMPANY_MANAGER;
    }
    return '';
  }
  const displayName = user.first_name + ' ' + user.last_name;
  return displayName;
};

export const retrieveUser = async (userId: string) => {
  return (await admin.firestore().collection(USERS).doc(userId).get()).data();
};

export const changeUserPassword = async (req: Request, res: Response)=> {
  try {
    // @ts-ignore
    const userUid = req.user.uid;
    req.body.updated_on = new Date().getTime();
    const newPassword = req.body.new_password;
    // const oldPassword = req.body.old_password;
    // @ts-ignore
    // TODO find a way to verify old password
    await admin.auth().updateUser(userUid, {password: newPassword});
    res.status(200).send({result: 'success'});
  } catch (errors) {
    res.status(500).send({
      errors: {message: 'Invalid password', code: 'wrong_password'}});
  }
};

