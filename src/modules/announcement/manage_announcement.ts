import {Request, Response} from 'express';
import {Announcement} from '../../dto/announcement';
import {isCompanyManager, isCompanyTenant}
  from '../authentication/authentication';
import admin from 'firebase-admin';
import {ANNOUNCEMENTS, CREATED_ON, DEFAULT, HOUSING_COMPANIES, HOUSING_COMPANY}
  from '../../constants';
import {getUserDisplayName} from '../user/manage_user';
import {sendTopicNotification} from '../notification/notification_service';

export const makeAnnouncement = async (request:Request, response: Response) => {
  // @ts-ignore
  const userId = request.user?.uid;
  const companyId = request.body.housing_company_id?.toString() ?? '';
  const company = await isCompanyManager(userId, companyId);
  if (company) {
    const title = request.body.title?.toString() ?? '';
    const subtitle = request.body.subtitle?.toString() ?? '';
    const body = request.body.body?.toString() ?? '';
    if (title.length === 0 || subtitle.length === 0 || body.length === 0) {
      response.status(500).send({
        errors: {error: 'Missing detail', code: 'missing_value'},
      });
      return;
    }
    const id = admin.firestore().collection(HOUSING_COMPANIES)
        .doc(companyId).collection(ANNOUNCEMENTS).doc().id;
    const userDisplayName = await getUserDisplayName(userId, companyId);
    const announcement : Announcement = {
      id: id,
      body: body,
      title: title,
      subtitle: subtitle,
      created_by: userId,
      created_on: new Date().getTime(),
      display_name: userDisplayName,
      is_deleted: false,
    };
    await admin.firestore().collection(HOUSING_COMPANIES)
        .doc(companyId).collection(ANNOUNCEMENTS).doc(id).set(announcement);
    response.status(200).send(announcement);
    // TODO: create notification channels/topics
    sendTopicNotification(DEFAULT, {
      title: title,
      body: subtitle,
      created_by: userId,
      display_name: userDisplayName,
      app_route_location: '/' + HOUSING_COMPANY + '/' + companyId,
    });
    return;
  }
  response.status(403).send({
    errors: {error: 'Not Manager', code: 'not_manager'},
  });
};

export const getAnnouncements = async (request:Request, response: Response) => {
  // @ts-ignore
  const userId = request.user?.uid;
  const companyId = request.query.housing_company_id?.toString() ?? '';
  const lastMessageTime =
        parseInt(request.query.last_announcement_time?.toString() ??
        new Date().getTime().toString());
  const total = parseInt(request.query.total?.toString() ?? '10');
  if (!await isCompanyTenant(userId, companyId)) {
    response.status(403).send({
      errors: {error: 'Not Tenant', code: 'not_tenant'},
    });
    return;
  }
  try {
    const announcements = (await admin.firestore()
        .collection(HOUSING_COMPANIES).doc(companyId).collection(ANNOUNCEMENTS)
        .orderBy(CREATED_ON, 'desc').startAfter(lastMessageTime).limit(total)
        .get()).docs.map((doc) => doc.data());
    response.status(200).send(announcements);
  } catch (errors) {
    console.log(errors);
    response.status(500).send({errors: errors});
  }
};


export const getAnnouncementRequest =
    async (request:Request, response: Response) => {
      // @ts-ignore
      const userId = request.user?.uid;
      const companyId = request.query.housing_company_id?.toString() ?? '';
      const announcementId =request.params.announcement_id?.toString() ?? '';

      if (!await isCompanyTenant(userId, companyId)) {
        response.status(403).send({
          errors: {error: 'Not Tenant', code: 'not_tenant'},
        });
        return;
      }
      try {
        const announcement = await getAnnouncement(companyId, announcementId);
        response.status(200).send(announcement);
      } catch (errors) {
        console.log(errors);
        response.status(500).send({errors: errors});
      }
    };

const getAnnouncement =
    async (companyId: string, announcementId: string) => {
      const announcement = (await admin.firestore()
          .collection(HOUSING_COMPANIES).doc(companyId)
          .collection(ANNOUNCEMENTS).doc(announcementId).get()).data();
      return announcement;
    };

export const editAnnouncement = async (request:Request, response: Response) => {
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
    if (!isDeleted &&
        (title.length === 0 || subtitle.length === 0 || body.length === 0)) {
      response.status(500).send({
        errors: {error: 'Missing detail', code: 'missing_value'},
      });
      return;
    }
    const userDisplayName = await getUserDisplayName(userId, companyId);
    const announcement : Announcement = {
      body: body,
      title: title,
      subtitle: subtitle,
      updated_by: userId,
      display_name: userDisplayName,
      is_deleted: isDeleted,
      updated_on: new Date().getTime(),
    };
    await admin.firestore().collection(HOUSING_COMPANIES)
        .doc(companyId).collection(ANNOUNCEMENTS)
        .doc(announcementId).update(announcement);
    const announcementUpdated =
        await getAnnouncement(companyId, announcementId);
    response.status(200).send(announcementUpdated);
    return;
  }
  response.status(403).send({
    errors: {error: 'Not Manager', code: 'not_manager'},
  });
};
