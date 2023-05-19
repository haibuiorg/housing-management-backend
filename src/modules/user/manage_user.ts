import { Request, Response } from 'express';
import admin from 'firebase-admin';
// eslint-disable-next-line max-len
import { COMPANY_MANAGER, HOUSING_COMPANIES, IS_VALID, NOTIFICATION_TOKENS, USERS } from '../../constants';
import { User } from '../../dto/user';
import { isCompanyManager } from '../authentication/authentication';
import { copyStorageFolder, getPublicLinkForFile } from '../storage/manage_storage';
import { addPaymentCustomerAccount } from '../payment-externals/payment-service';

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
  response.status(403).send({
    errors: { error: 'User data deleted', code: 'user_data_deleted' },
  });
};

export const updateUserData = async (request: Request, response: Response) => {
  // @ts-ignore
  const userId = request.user.uid;
  const firstName = request.body.first_name;
  const lastName = request.body.last_name;
  const phone = request.body.phone;
  const avatarStorageLocation = request.body.avatar_storage_location;

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
  if (avatarStorageLocation) {
    const lastPath = avatarStorageLocation.toString().split('/').at(-1);
    const newFileLocation = `public/users/${userId}/avatar/${lastPath}`;
    await copyStorageFolder(avatarStorageLocation, newFileLocation);
    // @ts-ignore
    updateField.avatar_storage_location = newFileLocation;
    const expiration = Date.now() + 604000;
    // @ts-ignore
    updateField.avatar_url = await getPublicLinkForFile(newFileLocation, expiration);
    // @ts-ignore
    updateField.avatar_url_expiration = expiration;
  }
  try {
    await admin.firestore().collection(USERS).doc(userId).update(updateField);
    const user = await retrieveUser(userId);
    response.status(200).send(user);
  } catch (errors) {
    response.status(500).send({ errors: errors });
  }
};

export const getUserNotificationTokens = async (userIds: string[]): Promise<string[]> => {
  const result: string[] = [];
  await Promise.all(
    userIds.map(async (id) => {
      try {
        const tokens = (
          await admin
            .firestore()
            .collection(USERS)
            .doc(id)
            .collection(NOTIFICATION_TOKENS)
            .where(IS_VALID, '==', true)
            .get()
        ).docs.map((doc) => doc.data().token);
        result.push(...(tokens ?? []));
      } catch (error) {
        console.log(error);
      }
    }),
  );
  return result.filter((element) => {
    return element !== '';
  });
};

export const getUserEmails = async (userIds: string[]): Promise<string[]> => {
  const result: string[] = [];
  await Promise.all(
    userIds.map(async (id) => {
      try {
        const email = (await admin.firestore().collection(USERS).doc(id).get())?.data()?.email;
        if (email) {
          result.push(email);
        }
      } catch (error) {
        console.log(error);
      }
    }),
  );
  return result.filter((element) => {
    return element !== '';
  });
};

const checkUserEmailVerificationStatus = async (request: Request): Promise<boolean> => {
  // @ts-ignore
  const emailVerified = request.user?.email_verified;
  // @ts-ignore
  const userId = request.user?.uid;
  await admin.firestore().collection(USERS).doc(userId).update({ email_verified: emailVerified });
  return emailVerified;
};

export const addHousingCompanyToUser = async (housingCompanyId: string, userId: string) => {
  await admin.firestore().collection(USERS).doc(userId).collection(HOUSING_COMPANIES).doc(housingCompanyId).set({
    user_id: userId,
    id: housingCompanyId,
    is_deleted: false,
  });
};

export const removeCompanyFromUser = async (housingCompanyId: string, userId: string) => {
  await admin.firestore().collection(USERS).doc(userId).collection(HOUSING_COMPANIES).doc(housingCompanyId).update({
    is_deleted: true,
  });
};

export const getUserDisplayName = async (userId: string, companyId: string) => {
  const user = (await retrieveUser(userId)) as User;
  if (user.first_name.length === 0 && user.last_name.length === 0) {
    if (await isCompanyManager(userId, companyId)) {
      return COMPANY_MANAGER;
    }
    return '';
  }
  const displayName = user.first_name + ' ' + user.last_name;
  return displayName;
};

export const retrieveUser = async (userId: string): Promise<User | undefined> => {
  const user = (await admin.firestore().collection(USERS).doc(userId).get()).data() as User;
  if (!user) {
    return undefined;
  }
  if ((user.avatar_url_expiration ?? Date.now()) <= Date.now() && (user.avatar_storage_location?.length ?? 0) > 0) {
    const expiration = Date.now() + 604000;
    // @ts-ignore
    const avatarUrl = await getPublicLinkForFile(user.avatar_storage_location ?? '', expiration);
    await admin.firestore().collection(USERS).doc(userId).update({
      avatar_url: avatarUrl,
      avatar_url_expiration: expiration,
    });
    user.avatar_url = avatarUrl;
    user.avatar_url_expiration = expiration;
  }
  if (!user.payment_customer_id) {
    const paymentCustomer = await addPaymentCustomerAccount(user.email);
    await admin.firestore().collection(USERS).doc(userId).update({
      payment_customer_id: paymentCustomer.id,
    });
    user.payment_customer_id = paymentCustomer.id;
  }
  return user;
};

export const changeUserPassword = async (req: Request, res: Response) => {
  try {
    // @ts-ignore
    const userUid = req.user.uid;
    req.body.updated_on = new Date().getTime();
    const newPassword = req.body.new_password;
    // const oldPassword = req.body.old_password;
    // @ts-ignore
    // TODO find a way to verify old password
    await admin.auth().updateUser(userUid, { password: newPassword });
    res.status(200).send({ result: 'success' });
  } catch (errors) {
    res.status(500).send({
      errors: { message: 'Invalid password', code: 'wrong_password' },
    });
  }
};
