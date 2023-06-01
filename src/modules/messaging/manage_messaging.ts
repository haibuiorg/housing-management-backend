import { Request, Response } from 'express';
import admin, { firestore } from 'firebase-admin';
// eslint-disable-next-line max-len
import {
  ADMIN_BOT_MESSAGE_TYPE,
  AI_SENDER_ID,
  APP_COLOR,
  BOT_SUPPORT_MESSAGE_TYPE,
  COMMUNITY_MESSAGE_TYPE,
  CONVERSATIONS,
  COUNTRY_CODE,
  FAULT_REPORT_MESSAGE_TYPE,
  HOUSING_COMPANIES,
  LANGUAGE_CODE,
  MESSAGES,
  SUPPORT_CHANNELS,
  SUPPORT_MESSAGE_TYPE,
  USERS,
} from '../../constants';
import { Conversation } from '../../dto/conversation';
import { Message } from '../../dto/message';
import { StorageItem } from '../../dto/storage_item';
import { getAdminUser } from '../admin/admin-service';
import { isAdminRole, isCompanyManager, isCompanyTenant } from '../authentication/authentication';
import { adminAskQuestion, askQuestion } from '../chat-helper/chat-helper-service';
import { sendEmail } from '../email/email_module';
import { sendNotificationToUsers } from '../notification/notification_service';
import { copyStorageFolder } from '../storage/manage_storage';
import { getSubscriptionPlanById, hasOneActiveSubscription } from '../subscription/subscription-service';
import { getMessageTranslation, storageItemTranslation } from '../translation/translation_service';
import { getUserDisplayName } from '../user/manage_user';

export const sendMessage = async (request: Request, response: Response) => {
  const message = request.body.message;
  const type = request.body?.type;
  const channelId = request.body.channel_id;
  const conversationId = request.body.conversation_id;
  if (!channelId || !message || !type || !conversationId) {
    response.status(500).send({ errors: { message: 'Missing value', code: 'missing_value' } });
    return;
  }
  // @ts-ignore
  const senderId = request.user?.uid;
  const mainPath =
    type === COMMUNITY_MESSAGE_TYPE || type === FAULT_REPORT_MESSAGE_TYPE ? HOUSING_COMPANIES : type == ADMIN_BOT_MESSAGE_TYPE ? USERS : SUPPORT_CHANNELS;
  const conversation = await getConversationDetail(type, channelId, conversationId);
  if (conversation.user_ids?.includes(senderId) !== true) {
    response.status(403).send({
      errors: { message: 'Unauthorized', code: 'unauthorized_sender' },
    });
    return;
  }
  const senderName = await getUserDisplayName(senderId, type === COMMUNITY_MESSAGE_TYPE ? channelId : '');

  const messageId = admin
    .firestore()
    .collection(mainPath)
    .doc(channelId)
    .collection(CONVERSATIONS)
    .doc(conversationId)
    .collection(MESSAGES)
    .doc().id;
  const createdOn = new Date().getTime();
  const messageData: Message = {
    created_on: createdOn,
    id: messageId,
    message: message,
    sender_id: senderId,
    sender_name: senderName,
    updated_on: createdOn,
    seen_by: [senderId],
  };
  const storageItems = request.body.storage_items;
  if (storageItems && storageItems.length > 0) {
    const storageItemArray: StorageItem[] = [];
    await Promise.all(
      storageItems.map(async (link: string) => {
        try {
          const lastPath = link.toString().split('/').at(-1);
          const newFileLocation = `conversations/${conversationId}/${lastPath}`;
          await copyStorageFolder(link, newFileLocation);
          storageItemArray.push({
            storage_link: newFileLocation,
            name: lastPath ?? '',
            summary_translations: null,
          });
        } catch (error) {
          console.log(error);
        }
      }),
    );
    messageData.storage_items = storageItemArray;
  }

  try {
    await admin
      .firestore()
      .collection(mainPath)
      .doc(channelId)
      .collection(CONVERSATIONS)
      .doc(conversationId)
      .collection(MESSAGES)
      .doc(messageId)
      .set(messageData);
    if (conversation) {
      const userIds = (conversation as Conversation).user_ids;
      const sendNotificationUserList = userIds?.filter((item) => item !== senderId);
      if (sendNotificationUserList && sendNotificationUserList.length > 0) {
        sendNotificationToUsers(sendNotificationUserList, {
          title: conversation.name,
          body: message,
          color: APP_COLOR,
          app_route_location: '/message/' + conversation.type + '/' + conversation.channel_id + '/' + conversation.id,
        });
      }
      await admin
        .firestore()
        .collection(mainPath)
        .doc(channelId)
        .collection(CONVERSATIONS)
        .doc(conversationId)
        .update({
          updated_on: createdOn,
          last_message_not_seen_by: sendNotificationUserList ?? [],
        });
    }
    response.status(200).send(messageData);
    translateMassage(messageData, mainPath, channelId, conversationId, senderId, type);
    storageItemTranslation(messageData.storage_items ?? []);
    if (conversation.type === BOT_SUPPORT_MESSAGE_TYPE || conversation.type === ADMIN_BOT_MESSAGE_TYPE) {

      const loadingData: Message = {
        created_on: Date.now(),
        id: "-1",
        message: "Thinking ...",
        sender_id: 'support',
        sender_name: 'AI',
        updated_on: Date.now(),
      };
      await admin
        .firestore()
        .collection(mainPath)
        .doc(channelId)
        .collection(CONVERSATIONS)
        .doc(conversationId)
        .collection(MESSAGES)
        .doc("-1")
        .set(loadingData);
      const chatHistory = (
        await admin
          .firestore()
          .collection(mainPath)
          .doc(channelId)
          .collection(CONVERSATIONS)
          .doc(conversationId)
          .collection(MESSAGES)
          .limit(50)
          .get()
      ).docs.map((item) => item.data()) as Message[];
      const answer = conversation.type === ADMIN_BOT_MESSAGE_TYPE ? await adminAskQuestion(senderId, message, chatHistory) : await askQuestion(
        message,
        'housing-company-generic',
        'housing-company-generic',
        chatHistory
          .sort((a, b) => a.created_on - b.created_on)
          .map((item) => {
            if (item.sender_id === 'support') {
              return 'Output: ' + item.message;
            }
            return 'Input: ' + item.message;
          }),
      );
      await admin
        .firestore()
        .collection(mainPath)
        .doc(channelId)
        .collection(CONVERSATIONS)
        .doc(conversationId)
        .collection(MESSAGES)
        .doc("-1").delete()

      const newMessageId = admin
        .firestore()
        .collection(mainPath)
        .doc(channelId)
        .collection(CONVERSATIONS)
        .doc(conversationId)
        .collection(MESSAGES)
        .doc().id;
      const answerData: Message = {
        created_on: Date.now(),
        id: newMessageId,
        message: answer,
        sender_id: AI_SENDER_ID,
        sender_name: 'AI',
        updated_on: Date.now(),
        seen_by: [AI_SENDER_ID],
      };

      await admin
        .firestore()
        .collection(mainPath)
        .doc(channelId)
        .collection(CONVERSATIONS)
        .doc(conversationId)
        .collection(MESSAGES)
        .doc(newMessageId)
        .set(answerData);
      if (conversation.type !== ADMIN_BOT_MESSAGE_TYPE) {
        translateMassage(answerData, mainPath, channelId, conversationId, 'support', type);
      }
    }
  } catch (errors) {
    console.log(errors);
    response.status(500).send({ errors: errors });
  }
};

const translateMassage = async (
  messageData: Message,
  collection: string,
  channelId: string,
  conversationId: string,
  userId: string,
  type: string,
) => {
  try {
    const translatedValue = await getMessageTranslation(
      messageData.message,
      channelId,
      type === COMMUNITY_MESSAGE_TYPE || FAULT_REPORT_MESSAGE_TYPE ? 'message' : 'support',
      userId,
    );
    await admin
      .firestore()
      .collection(collection)
      .doc(channelId)
      .collection(CONVERSATIONS)
      .doc(conversationId)
      .collection(MESSAGES)
      .doc(messageData.id)
      .update({ translated_message: translatedValue, updated_on: new Date().getTime() });
  } catch (error) {
    console.log(error);
  }
};

const getConversationDetail = async (
  type: string,
  channelId: string,
  conversationId: string,
): Promise<Conversation> => {
  const mainPath =
    type === COMMUNITY_MESSAGE_TYPE || type === FAULT_REPORT_MESSAGE_TYPE ? HOUSING_COMPANIES : type === ADMIN_BOT_MESSAGE_TYPE ? USERS : SUPPORT_CHANNELS;
  try {
    return (
      await admin.firestore().collection(mainPath).doc(channelId).collection(CONVERSATIONS).doc(conversationId).get()
    ).data() as Conversation;
  } catch (error) {
    console.log(error);
    return {} as Conversation;
  }
};

export const getConversationRequest = async (request: Request, response: Response) => {
  const type = request.query.type;
  const channelId = request.query.channel_id;
  const conversationId = request.query.conversation_id;
  if (!channelId || !type || !conversationId) {
    response.status(500).send({ errors: { message: 'Missing value', code: 'missing_value' } });
    return;
  }
  // @ts-ignore
  const senderId = request.user?.uid;
  try {
    const conversation = await getConversationDetail(
      type?.toString() ?? '',
      channelId?.toString() ?? '',
      conversationId?.toString() ?? '',
    );
    if (type === COMMUNITY_MESSAGE_TYPE) {
      if (!(await isCompanyTenant(senderId, channelId?.toString() ?? ''))) {
        response.status(403).send({
          errors: { message: 'Unauthorized', code: 'unauthorized_sender' },
        });
        return;
      }
    } else if (type === SUPPORT_MESSAGE_TYPE || type === BOT_SUPPORT_MESSAGE_TYPE) {
      if (conversation.user_ids?.includes(senderId) !== true && !isAdminRole(senderId)) {
        response.status(403).send({
          errors: { message: 'Unauthorized', code: 'unauthorized_sender' },
        });
        return;
      }
    }
    response.status(200).send(conversation);
  } catch (errors) {
    console.log(errors);
    response.status(500).send({ errors: errors });
  }
};

export const setConversationSeenRequest = async (request: Request, response: Response) => {
  const type = request.body?.type;
  const channelId = request.body.channel_id;
  const conversationId = request.body.conversation_id;
  if (!channelId || !type || !conversationId) {
    response.status(500).send({ errors: { message: 'Missing value', code: 'missing_value' } });
    return;
  }
  // @ts-ignore
  const userId = request.user?.uid;
  if (type === COMMUNITY_MESSAGE_TYPE || type === FAULT_REPORT_MESSAGE_TYPE) {
    if (!(await isCompanyTenant(userId, channelId))) {
      response.status(403).send({ errors: { message: 'Unauthorized', code: 'unauthorized' } });
      return;
    }
    await admin
      .firestore()
      .collection(HOUSING_COMPANIES)
      .doc(channelId)
      .collection(CONVERSATIONS)
      .doc(conversationId)
      .update({
        last_message_not_seen_by: firestore.FieldValue.arrayRemove(userId),
      });
  } else if (type === SUPPORT_MESSAGE_TYPE) {
    await admin
      .firestore()
      .collection(SUPPORT_CHANNELS)
      .doc(channelId)
      .collection(CONVERSATIONS)
      .doc(conversationId)
      .update({
        last_message_not_seen_by: firestore.FieldValue.arrayRemove(userId),
      });
  } else {
    response.status(500).send({ errors: { message: 'Invalid type', code: 'invalid_type' } });
    return;
  }
  const conversation = await getConversationDetail(type, channelId, conversationId);
  response.status(200).send(conversation);
};

export const joinConversationRequest = async (request: Request, response: Response) => {
  const type = request.body.type;
  const channelId = request.body.channel_id;
  const conversationId = request.body.conversation_id;
  if (!channelId || !type || !conversationId) {
    response.status(500).send({ errors: { message: 'Missing value', code: 'missing_value' } });
    return;
  }
  // @ts-ignore
  const userId = request.user?.uid;
  if (type === COMMUNITY_MESSAGE_TYPE) {
    if (!(await isCompanyTenant(userId, channelId))) {
      response.status(403).send({ errors: { message: 'Unauthorized', code: 'unauthorized' } });
      return;
    }
    await admin
      .firestore()
      .collection(HOUSING_COMPANIES)
      .doc(channelId)
      .collection(CONVERSATIONS)
      .doc(conversationId)
      .update({
        user_ids: firestore.FieldValue.arrayUnion(userId),
      });
  } else if (type === SUPPORT_MESSAGE_TYPE) {
    if (!(await isAdminRole(userId))) {
      response.status(403).send({ errors: { message: 'Unauthorized', code: 'unauthorized' } });
      return;
    }
    await admin
      .firestore()
      .collection(SUPPORT_CHANNELS)
      .doc(channelId)
      .collection(CONVERSATIONS)
      .doc(conversationId)
      .update({
        user_ids: firestore.FieldValue.arrayUnion(userId),
      });
  } else {
    response.status(500).send({ errors: { message: 'Invalid type', code: 'invalid_type' } });
    return;
  }
  const conversation = await getConversationDetail(type, channelId, conversationId);
  response.status(200).send(conversation);
};

export const startNewConversationRequest = async (request: Request, response: Response) => {
  const type = request.body?.type;
  // @ts-ignore
  const userId = request.user?.uid;
  if (!type) {
    response.status(500).send({ errors: { message: 'Missing value', code: 'missing_value' } });
    return;
  }
  const name = request.body.name?.toString() ?? userId + '_' + new Date().getTime();
  if (type === COMMUNITY_MESSAGE_TYPE) {
    const channelIdOrCompanyId = request.body.channel_id?.toString() ?? '';
    const company = await isCompanyManager(userId, channelIdOrCompanyId);
    if (!company) {
      response.status(403).send({
        errors: { message: 'Unauthorized', code: 'unauthorized_starter' },
      });
      return;
    }
    const activeSubscription = await hasOneActiveSubscription(channelIdOrCompanyId);
    if (!activeSubscription) {
      response.status(403).send({
        errors: {
          error: 'No active subscription',
          code: 'no_active_subscription',
        },
      });
      return;
    }
    const subscriptionPlan = await getSubscriptionPlanById(activeSubscription.subscription_plan_id);
    const conversationCount = await getCompanyConversationCount(channelIdOrCompanyId);
    if (conversationCount >= subscriptionPlan.max_messaging_channels) {
      response.status(403).send({
        errors: {
          error: 'Max conversation count reached',
          code: 'max_conversation_count_reached',
        },
      });
      return;
    }
    const conversationId = admin
      .firestore()
      .collection(HOUSING_COMPANIES)
      .doc(channelIdOrCompanyId)
      .collection(CONVERSATIONS)
      .doc().id;
    const createdOn = new Date().getTime();
    const conversation: Conversation = {
      id: conversationId,
      channel_id: channelIdOrCompanyId,
      name: name,
      type: type,
      created_on: createdOn,
      updated_on: createdOn,
      status: 'ongoing',
      user_ids: [userId],
      apartment_id: null,
    };
    await admin
      .firestore()
      .collection(HOUSING_COMPANIES)
      .doc(channelIdOrCompanyId)
      .collection(CONVERSATIONS)
      .doc(conversationId)
      .set(conversation);
    response.status(200).send(conversation);
  } else if (type === SUPPORT_MESSAGE_TYPE || type === BOT_SUPPORT_MESSAGE_TYPE) {
    let channelId = request.body.channel_id?.toString() ?? '';
    if (channelId.length === 0) {
      const countryCode = request.body.country_code?.toString() ?? '';
      const languageCode = request.body.language_code?.toString() ?? '';
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
      type: type,
      status: 'pending',
      created_on: createdOn,
      updated_on: createdOn,
      user_ids: [userId],
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
  } else if (type === ADMIN_BOT_MESSAGE_TYPE) {
    const isAdmin = await isAdminRole(userId);
    if (!isAdmin) {
      response.sendStatus(403);
      return;
    }
    const conversationId = admin
      .firestore()
      .collection(USERS)
      .doc(userId)
      .collection(CONVERSATIONS)
      .doc().id;
    const conversation: Conversation = {
      id: conversationId,
      channel_id: userId,
      name,
      type,
      status: 'ongoing',
      created_on: Date.now(),
      updated_on: Date.now(),
      user_ids: [userId],
      apartment_id: null,
    };
    await admin
      .firestore()
      .collection(USERS)
      .doc(userId)
      .collection(CONVERSATIONS)
      .doc(conversationId)
      .set(conversation);
    response.status(200).send(conversation);
  } else {
    console.log(type);
    response.status(500).send({ errors: { message: 'Invalid type', code: 'invalid_type' } });
  }
};

export const getCompanyConversationCount = async (companyId: string): Promise<number> => {
  const querySnapshot = await admin
    .firestore()
    .collection(HOUSING_COMPANIES)
    .doc(companyId)
    .collection(CONVERSATIONS)
    .count()
    .get();
  return querySnapshot.data()?.count ?? 0;
};


// Right now only support BOT_SUPPORT => SUPPORT
export const changeConversationType = async (request: Request, response: Response) => {
  const type = request.body.type;
  const channelId = request.body.channel_id;
  const conversationId = request.body.conversation_id;
  if (!channelId || !type || !conversationId) {
    console.log("request", request.body)
    response.status(500).send({ errors: { message: 'Missing value', code: 'missing_value' } });
    return;
  }
  // @ts-ignore
  const userId = request.user?.uid;
  const conversation = await getConversationDetail(type.toString(), channelId.toString(), conversationId?.toString());
  if (!conversation || conversation.user_ids?.indexOf(userId) === -1) {
    response.status(404).send({ errors: { message: 'Not found', code: 'not_found' } });
    return;
  }
  if (type === BOT_SUPPORT_MESSAGE_TYPE) {
    try {
      await admin
        .firestore()
        .collection(SUPPORT_CHANNELS)
        .doc(channelId.toString() ?? '')
        .collection(CONVERSATIONS)
        .doc(conversationId?.toString())
        .update({ type: SUPPORT_MESSAGE_TYPE });
      conversation.type = SUPPORT_MESSAGE_TYPE;
      //notify admin
      sendEmailToAdmin(conversation);
      response.status(200).send(conversation);
      return;
    } catch (error) {
      console.error(error);
      response.status(500).send({ errors: { message: 'Something wrong', code: 'something_wrong' } });
      return;
    }

  }
  console.log(type);
  response.status(500).send({ errors: { message: 'Invalid type', code: 'invalid_type' } });
};

const sendEmailToAdmin = async (conversation: Conversation) => {
  const admins = await getAdminUser();
  const adminEmails = admins?.map((admin) => admin.email);
  if (adminEmails && adminEmails.length > 0) {
    await sendEmail(adminEmails, 'Automatic email', 'New support message', `New support message from ${conversation.name}`, 'New support message check it please', [])
  }

}

