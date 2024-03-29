import { Request, Response } from 'express';
import { Announcement } from '../../dto/announcement';
import { isCompanyManager, isCompanyTenant } from '../authentication/authentication';
import admin from 'firebase-admin';
// eslint-disable-next-line max-len
import { ANNOUNCEMENTS, CREATED_ON, DEFAULT, DOCUMENTS, HOUSING_COMPANIES, HOUSING_COMPANY } from '../../constants';
import { getUserDisplayName, getUserEmails } from '../user/manage_user';
import { sendTopicNotification } from '../notification/notification_service';
import { StorageItem } from '../../dto/storage_item';

import { copyStorageFolder, getPublicLinkForFile } from '../storage/manage_storage';
import { sendEmail } from '../email/email_module';
import { getCompanyTenantIds } from '../housing/manage_housing_company';
import { getSubscriptionPlanById, hasOneActiveSubscription } from '../subscription/subscription-service';
import { getMessageTranslation, storageItemTranslation } from '../translation/translation_service';

export const makeAnnouncement = async (request: Request, response: Response) => {
  // @ts-ignore
  const userId = request.user?.uid;
  const companyId = request.body.housing_company_id?.toString() ?? '';
  const company = await isCompanyManager(userId, companyId);
  if (company) {
    /*const subscription = await hasOneActiveSubscription(companyId);
		if (!subscription) {
			response.status(403).send({
				errors: {error: 'No active subscription', code: 'no_active_subscription'},
			});
			return;
		}
		const subscriptionPlan = await getSubscriptionPlanById(subscription.subscription_plan_id);
		const announcementCount = await getThisCycleAnnouncementCount(companyId);
		if (announcementCount >= subscriptionPlan.max_announcement) {
			response.status(403).send({
				errors: {error: 'Max announcement reached', code: 'max_announcement_reached'},
			});
			return;
		}*/
    const title = request.body.title?.toString() ?? '';
    const subtitle = request.body.subtitle?.toString() ?? '';
    const body = request.body.body?.toString() ?? '';
    if (title.length === 0 || body.length === 0) {
      response.status(500).send({
        errors: { error: 'Missing detail', code: 'missing_value' },
      });
      return;
    }
    const id = admin.firestore().collection(HOUSING_COMPANIES).doc(companyId).collection(ANNOUNCEMENTS).doc().id;
    const storageItems = request.body.storage_items;
    const storageItemArray: StorageItem[] = [];
    if (storageItems && storageItems.length > 0) {
      const createdOn = new Date().getTime();
      await Promise.all(
        storageItems.map(async (link: string) => {
          try {
            const lastPath = link.toString().split('/').at(-1);
            const newFileLocation =
              // eslint-disable-next-line max-len
              `${HOUSING_COMPANIES}/${companyId}/announcement/${lastPath}`;
            await copyStorageFolder(link, newFileLocation);
            const expiration = Date.now() + 604000;
            const presigned_url = await getPublicLinkForFile(newFileLocation);
            const storageItem: StorageItem = {
              type: 'announcement',
              name: lastPath ?? '',
              id: id,
              is_deleted: false,
              uploaded_by: userId,
              storage_link: newFileLocation,
              created_on: createdOn,
              presigned_url,
              expired_on: expiration,
              summary_translations: null,
            };
            await admin
              .firestore()
              .collection(HOUSING_COMPANIES)
              .doc(companyId)
              .collection(DOCUMENTS)
              .doc(id)
              .set(storageItem);
            storageItemArray.push(storageItem);
          } catch (error) {
            response.status(500).send({ errors: error });
            console.log(error);
          }
        }),
      );
    }
    const userDisplayName = await getUserDisplayName(userId, companyId);

    const announcement: Announcement = {
      id,
      body,
      title,
      subtitle,
      created_by: userId,
      created_on: new Date().getTime(),
      display_name: userDisplayName,
      is_deleted: false,
      storage_items: storageItemArray,
    };

    await admin
      .firestore()
      .collection(HOUSING_COMPANIES)
      .doc(companyId)
      .collection(ANNOUNCEMENTS)
      .doc(id)
      .set(announcement);
    response.status(200).send(announcement);
    storageItemTranslation(storageItemArray);
    translateAnnouncement(announcement, companyId);
    // TODO: create notification channels/topics
    sendTopicNotification(DEFAULT, {
      title: title,
      body: subtitle,
      created_by: userId,
      display_name: userDisplayName,
      app_route_location: '/' + HOUSING_COMPANY + '/' + companyId,
    });
    if (request.body.send_email) {
      const usersInCompany = await getCompanyTenantIds(companyId, true, true);
      const emails = await getUserEmails(usersInCompany);
      const acitveSubscription = await hasOneActiveSubscription(companyId);
      if (!acitveSubscription || acitveSubscription.is_active !== true) {
        return;
      }
      const subscriptionPlan = await getSubscriptionPlanById(acitveSubscription.subscription_plan_id);
      if (subscriptionPlan.notification_types.includes('email')) {
        sendEmail(
          emails,
          userDisplayName,
          title,
          subtitle,
          body,
          storageItemArray.map((it) => it.storage_link ?? ''),
        );
      }
    }
    return;
  }
  response.status(403).send({
    errors: { error: 'Not Manager', code: 'not_manager' },
  });
};

export const getAnnouncements = async (request: Request, response: Response) => {
  //@ts-ignore
  const userId = request.user?.uid;
  const companyId = request.query.housing_company_id?.toString() ?? '';
  const lastMessageTime = parseInt(request.query.last_announcement_time?.toString() ?? new Date().getTime().toString());
  const total = parseInt(request.query.total?.toString() ?? '10');
  if (!(await isCompanyTenant(userId, companyId))) {
    response.status(403).send({
      errors: { error: 'Not Tenant', code: 'not_tenant' },
    });
    return;
  }
  try {
    const announcements = (
      await admin
        .firestore()
        .collection(HOUSING_COMPANIES)
        .doc(companyId)
        .collection(ANNOUNCEMENTS)
        .orderBy(CREATED_ON, 'desc')
        .startAfter(lastMessageTime)
        .limit(total)
        .get()
    ).docs.map((doc) => doc.data());
    response.status(200).send(announcements);
  } catch (errors) {
    console.log(errors);
    response.status(500).send({ errors: errors });
  }
};

export const getAnnouncementRequest = async (request: Request, response: Response) => {
  // @ts-ignore
  const userId = request.user?.uid;
  const companyId = request.query.housing_company_id?.toString() ?? '';
  const announcementId = request.params.announcement_id?.toString() ?? '';

  if (!(await isCompanyTenant(userId, companyId))) {
    response.status(403).send({
      errors: { error: 'Not Tenant', code: 'not_tenant' },
    });
    return;
  }
  try {
    const announcement = await getAnnouncement(companyId, announcementId);
    response.status(200).send(announcement);
  } catch (errors) {
    console.log(errors);
    response.status(500).send({ errors: errors });
  }
};

const getAnnouncement = async (companyId: string, announcementId: string) => {
  const announcement = (
    await admin
      .firestore()
      .collection(HOUSING_COMPANIES)
      .doc(companyId)
      .collection(ANNOUNCEMENTS)
      .doc(announcementId)
      .get()
  ).data();
  if (announcement?.storage_items && announcement?.storage_items?.length > 0) {
    const storageItems: StorageItem[] = [];
    await Promise.all(
      announcement?.storage_items?.map(async (item: StorageItem) => {
        try {
          if (item.created_on ?? 0 < new Date().getTime()) {
            item.created_on = new Date().getTime();
            const expiration = Date.now() + 604000;
            item.presigned_url = await getPublicLinkForFile(item.storage_link ?? '', expiration);
            item.expired_on = expiration;
          }
        } catch (error) {
          console.error(error);
        }
        storageItems.push(item);
      }),
    );
    await admin
      .firestore()
      .collection(HOUSING_COMPANIES)
      .doc(companyId)
      .collection(ANNOUNCEMENTS)
      .doc(announcementId)
      .update({ storage_items: storageItems });
    announcement.storage_items = storageItems;
  }

  return announcement as Announcement;
};

export const editAnnouncement = async (request: Request, response: Response) => {
  // @ts-ignore
  const userId = request.user?.uid;
  const companyId = request.body.housing_company_id?.toString() ?? '';
  const announcementId = request.body.announcement_id?.toString() ?? '';
  const company = await isCompanyManager(userId, companyId);
  if (company) {
    const title = request.body.title?.toString() ?? '';
    const subtitle = request.body.subtitle?.toString() ?? '';
    const body = request.body.body?.toString() ?? '';
    const isDeleted = request.body?.is_deleted ?? false;
    if (!isDeleted && (title.length === 0 || subtitle.length === 0 || body.length === 0)) {
      response.status(500).send({
        errors: { error: 'Missing detail', code: 'missing_value' },
      });
      return;
    }
    const userDisplayName = await getUserDisplayName(userId, companyId);

    const announcement: Announcement = {
      body,
      title,
      subtitle,
      updated_by: userId,
      display_name: userDisplayName,
      is_deleted: isDeleted,
      updated_on: new Date().getTime(),
    };

    await admin
      .firestore()
      .collection(HOUSING_COMPANIES)
      .doc(companyId)
      .collection(ANNOUNCEMENTS)
      .doc(announcementId)
      .update(announcement);
    const announcementUpdated = await getAnnouncement(companyId, announcementId);
    response.status(200).send(announcementUpdated);
    translateAnnouncement(announcement, companyId);
    return;
  }
  response.status(403).send({
    errors: { error: 'Not Manager', code: 'not_manager' },
  });
};

const translateAnnouncement = async (announcement: Announcement, companyId: string) => {
  const announcementBodyTranslation = await getMessageTranslation(
    announcement.body ?? 'Empty message',
    companyId,
    'announcement',
    announcement.created_by ?? '',
  );
  const announcementTitleTranslation = await getMessageTranslation(
    announcement.title ?? 'Empty title',
    companyId,
    'announcement',
    announcement.created_by ?? '',
  );
  const announcementSubtitleTranslation = await getMessageTranslation(
    announcement.subtitle ?? 'Empty subtitle',
    companyId,
    'announcement',
    announcement.created_by ?? '',
  );
  announcement.translated_body = announcementBodyTranslation;
  announcement.translated_title = announcementTitleTranslation;
  announcement.translated_subtitle = announcementSubtitleTranslation;
  announcement.updated_on = new Date().getTime();
  await admin
    .firestore()
    .collection(HOUSING_COMPANIES)
    .doc(companyId)
    .collection(ANNOUNCEMENTS)
    .doc(announcement.id!)
    .update(announcement);
  return announcement;
};

export const getThisCycleAnnouncementCount = async (companyId: string): Promise<number> => {
  const date = new Date();
  const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);

  const count = await admin
    .firestore()
    .collection(HOUSING_COMPANIES)
    .doc(companyId)
    .collection(ANNOUNCEMENTS)
    .where(CREATED_ON, '>=', firstDay.getTime())
    .where(CREATED_ON, '<=', lastDay.getTime())
    .count()
    .get();
  return count.data().count;
};
