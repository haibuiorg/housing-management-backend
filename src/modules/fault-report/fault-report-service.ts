import { Request, Response } from "express";
import admin from "firebase-admin";
import { isAuthorizedAccessToApartment } from "../authentication/authentication";
// eslint-disable-next-line max-len
import {
  APP_COLOR,
  CONVERSATIONS,
  FAULT_REPORT_MESSAGE_TYPE,
  HOUSING_COMPANIES,
  MESSAGES,
} from "../../constants";

import { retrieveUser } from "../user/manage_user";
import { Conversation } from "../../dto/conversation";
import { StorageItem } from "../../dto/storage_item";
import { sendNotificationToUsers } from "../notification/notification_service";
import { copyStorageFolder } from "../storage/manage_storage";
import { Message } from "../../dto/message";
import {
  getCompanyData,
  getCompanyManagerDetails,
} from "../housing/manage_housing_company";
import { User } from "../../dto/user";
import { sendFaultReportEmail } from "../email/email_module";
import { storageItemTranslation } from "../translation/translation_service";

export const createFaultReport = async (
  request: Request,
  response: Response
) => {
  // @ts-ignore
  const senderId = request.user?.uid;
  const companyId = request.params.companyId;
  const apartmentId = request.params.apartmentId;
  if (
    !(await isAuthorizedAccessToApartment(senderId, companyId, apartmentId))
  ) {
    response.status(403).send({
      errors: "no_permission",
    });
    return;
  }
  const title = request.body.title;
  const description = request.body.description;
  const storageItems = request.body.storage_items;
  const mainPath = HOUSING_COMPANIES;
  const name = `Fault report ${title}`;
  const companyManagers = await getCompanyManagerDetails(companyId);
  const companyMangerIds = companyManagers.map((it) => it.user_id);
  const conversationId = admin
    .firestore()
    .collection(HOUSING_COMPANIES)
    .doc(companyId)
    .collection(CONVERSATIONS)
    .doc().id;
  const userIdList: string[] = [
    ...new Set([...([senderId] ?? []), ...(companyMangerIds ?? [])]),
  ];
  const createdOn = new Date().getTime();
  const conversation: Conversation = {
    id: conversationId,
    channel_id: companyId,
    name: name,
    type: FAULT_REPORT_MESSAGE_TYPE,
    created_on: createdOn,
    updated_on: createdOn,
    status: "pending",
    user_ids: userIdList,
    apartment_id: apartmentId,
  };
  await admin
    .firestore()
    .collection(HOUSING_COMPANIES)
    .doc(companyId)
    .collection(CONVERSATIONS)
    .doc(conversationId)
    .set(conversation);
  const user = (await retrieveUser(senderId)) as User;
  const senderName = user.first_name + " " + user.last_name;
  const messageId = admin
    .firestore()
    .collection(mainPath)
    .doc(companyId)
    .collection(CONVERSATIONS)
    .doc(conversationId)
    .collection(MESSAGES)
    .doc().id;
  const message = `${title}
        \n
      ${description}`;
  const messageData: Message = {
    created_on: createdOn,
    id: messageId,
    message: `
        ${title}

        ${description}`,
    sender_id: senderId,
    sender_name: senderName,
    seen_by: [senderId],
  };
  const storageItemArray: StorageItem[] = [];
  if (storageItems && storageItems.length > 0) {
    await Promise.all(
      storageItems.map(async (link: string) => {
        try {
          const lastPath = link.toString().split("/").at(-1);
          const newFileLocation = `conversations/${conversationId}/${lastPath}`;
          await copyStorageFolder(link, newFileLocation);
          storageItemArray.push({
            storage_link: newFileLocation,
            name: lastPath ?? "",
            summary_translations: null,
          });
        } catch (error) {
          console.log(error);
        }
      })
    );
    messageData.storage_items = storageItemArray;
    
  }

  try {
    await admin
      .firestore()
      .collection(mainPath)
      .doc(companyId)
      .collection(CONVERSATIONS)
      .doc(conversationId)
      .collection(MESSAGES)
      .doc(messageId)
      .set(messageData);

    if (conversation) {
      const userIds = (conversation as Conversation).user_ids;
      const sendNotificationUserList = userIds?.filter(
        (item) => item !== senderId
      );
      if (sendNotificationUserList && sendNotificationUserList.length > 0) {
        const companyData = await getCompanyData(companyId);
        sendNotificationToUsers(sendNotificationUserList, {
          title: conversation.name,
          body: message,
          color: companyData?.ui?.seed_color ?? APP_COLOR,
          app_route_location:
            "/message/" +
            conversation.type +
            "/" +
            conversation.channel_id +
            "/" +
            conversation.id,
        });
      }
      await admin
        .firestore()
        .collection(mainPath)
        .doc(companyId)
        .collection(CONVERSATIONS)
        .doc(conversationId)
        .update({
          updated_on: createdOn,
          last_message_not_seen_by: sendNotificationUserList ?? [],
        });
    }
    if (request.body.send_email) {
      const emails = companyManagers.map((it) => it.email);
      sendFaultReportEmail(
        emails,
        user.email,
        senderName,
        title,
        description,
        storageItemArray.map((it) => it.storage_link ?? "")
      );
    }
    response.status(200).send(conversation);
    storageItemTranslation(storageItemArray);
  } catch (errors) {
    response.status(500).send({ errors: errors });
  }
};

export const getFaultReports = async (
  request: Request,
  response: Response
) => {};

export const getFaultReport = async (
  request: Request,
  response: Response
) => {};

export const editFaultReport = async (
  request: Request,
  response: Response
) => {};

export const deleteFaultReport = async (
  request: Request,
  response: Response
) => {};
