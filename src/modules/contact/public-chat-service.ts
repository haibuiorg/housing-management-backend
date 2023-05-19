import { Request, Response } from 'express';
import { createUserWithEmail } from '../authentication/register';
import { getSupportedContries } from '../country/manage_country';
import admin from 'firebase-admin';
import { CONVERSATIONS, COUNTRY_CODE, LANGUAGE_CODE, SUPPORT_CHANNELS, SUPPORT_MESSAGE_TYPE } from '../../constants';
import { Conversation } from '../../dto/conversation';

export const startNewConversationRequest = async (request: Request, response: Response) => {
  const { email, country_code, language_code, first_name, last_name, conversation_name, phone } = request.body;
  const supportedCountries = await getSupportedContries();
  if (supportedCountries?.includes(country_code) !== true) {
    response.status(500).send({ errors: { code: 500, message: 'Invalid country code' } });
    return;
  }

  const user = await createUserWithEmail(email, country_code, first_name, last_name, phone);
  if (!user) {
    response.status(500).send({ errors: { code: 500, message: 'Invalid user info' } });
    return;
  }
  try {
    let channelId = request.body.channel_id?.toString() ?? '';
    if (channelId.length === 0) {
      const countryCode = country_code ?? 'fi';
      const languageCode = language_code ?? 'fi';
      const channel = (
        await admin
          .firestore()
          .collection(SUPPORT_CHANNELS)
          .where(COUNTRY_CODE, '==', countryCode)
          .where(LANGUAGE_CODE, '==', languageCode)
          .limit(1)
          .get()
      ).docs.map((doc) => doc.data())[0];
      if (!channel) {
        const error = {
          errors: { message: 'Something wrong', code: 'missing_country_data' },
        };
        console.error(error);
        response.status(500).send(error);
        return;
      }
      channelId = channel.id;
    }
    const name = conversation_name ?? user.user_id + '_' + new Date().getTime();
    const conversationId = admin
      .firestore()
      .collection(SUPPORT_CHANNELS)
      .doc(channelId)
      .collection(CONVERSATIONS)
      .doc().id;
    const createdOn = new Date().getTime();
    const conversation: Conversation = {
      id: conversationId,
      channel_id: channelId,
      name: name,
      type: SUPPORT_MESSAGE_TYPE,
      status: 'pending',
      created_on: createdOn,
      updated_on: createdOn,
      user_ids: [user.user_id],
      apartment_id: null,
    };
    await admin
      .firestore()
      .collection(SUPPORT_CHANNELS)
      .doc(channelId)
      .collection(CONVERSATIONS)
      .doc(conversationId)
      .set(conversation);
    response.status(200).send(conversation);
  } catch (error) {}
};
