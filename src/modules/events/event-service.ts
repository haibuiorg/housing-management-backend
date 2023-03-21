/* eslint-disable camelcase */
import { Request, Response } from "express";
import {
  isAdminRole,
  isAuthorizedAccessToApartment,
  isCompanyManager,
} from "../authentication/authentication";
import { Event } from "../../dto/event";
import admin from "firebase-admin";
import { EVENTS } from "../../constants";
import { getUserApartments } from "../housing/manage_apartment";
import { getUserDisplayName } from "../user/manage_user";

export const getEvents = async (request: Request, response: Response) => {
  // @ts-ignore
  const userId = request.user?.uid;
  const {
    company_id,
    apartment_id,
    types,
    last_created_on,
    from = new Date().getTime() - 31556952000,
    to = new Date().getTime() + 31556952000,
    include_deleted = false,
  } = request.query;
  const limit = request.query.limit
    ? parseInt(request.query.limit.toString())
    : 10;
  let query = admin
    .firestore()
    .collection(EVENTS)
    .where("start_time", ">=", from)
    .where("start_time", "<=", to);
  const isManager =
    (await isCompanyManager(userId, company_id?.toString() ?? "")) ||
    (await isAdminRole(userId));
  if (!company_id && !apartment_id) {
    query = query.where("invitees", "array-contains", userId?.toString());
  } else {
    if (company_id) {
      const tenants = await getUserApartments(
        userId,
        company_id?.toString() ?? ""
      );

      const hasAccessToCompany = tenants.length > 0 || isManager;
      if (!hasAccessToCompany) {
        response.status(500).send({
          errors: {
            error: "no_company_found",
          },
        });
        return;
      }
      query = query.where("company_id", "==", company_id);
    }
    if (apartment_id) {
      const apartment = await isAuthorizedAccessToApartment(
        userId,
        company_id?.toString() ?? "",
        apartment_id?.toString() ?? ""
      );
      if (!apartment) {
        response.status(500).send({
          errors: {
            error: "no_apartment_found",
          },
        });
        return;
      }
      query = query
        ? query.where("apartment_id", "==", apartment_id)
        : admin
            .firestore()
            .collection(EVENTS)
            .where("apartment_id", "==", apartment_id);
    }
  }
  if (types) {
    const processTypes: string[] = !isManager
      ? (types as string[]).filter((value) => value != "company_internal")
      : !isAdminRole
      ? (types as string[]).filter((value) => value != "generic")
      : (types as string[]);
    query = query
      ? query.where("type", "in", processTypes)
      : admin.firestore().collection(EVENTS).where("type", "in", processTypes);
  }
  if (!include_deleted) {
    query = query
      ? query.where("deleted", "==", false)
      : admin.firestore().collection(EVENTS).where("deleted", "==", false);
  }

  if (limit) {
    query = query.limit(parseInt(limit!.toString()));
  }
  if (last_created_on) {
    query = query.startAfter(last_created_on);
  }
  const result = (await query.get()).docs.map((doc) => doc.data());
  response.status(200).send(result);
};

export const getEvent = async (request: Request, response: Response) => {
  // @ts-ignore
  const userId = request.user?.uid;
  const event_id = request.params?.eventId;
  const event = await _getEvent(userId, event_id);
  if (!event) {
    response.status(500).send({
      errors: {
        error: "event_not_found",
      },
    });
    return;
  }
  response.status(200).send(event);
  return;
};

const _getEvent = async (userId: string, eventId: string) => {
  try {
    const event = (
      await admin.firestore().collection(EVENTS).doc(eventId).get()
    ).data() as Event;
    if (
      event.invitees?.includes(userId) ||
      event.type == "company" ||
      (event.type == "company_internal" &&
        (await isCompanyManager(userId, event.company_id ?? "")))
    ) {
      return event;
    }
  } catch (errors) {
    console.log(errors);
  }

  return null;
};

export const createEvents = async (request: Request, response: Response) => {
  // @ts-ignore
  const userId = request.user?.uid;
  const {
    name,
    description,
    end_time,
    start_time,
    repeat,
    repeat_until,
    type = "personal",
    invitees,
    company_id = "",
    apartment_id = "",
    reminders = [],
  } = request.body;
  const currentTime = new Date().getTime();
  const userName = await getUserDisplayName(userId, company_id);
  const event: Event = {
    created_by: userId,
    created_by_name: userName,
    start_time: start_time,
    end_time: end_time,
    name: name,
    repeat_until: repeat_until,
    description: description,
    type: type,
    repeat: repeat,
    company_id: company_id,
    apartment_id: apartment_id,
    invitees: [...new Set([...(invitees ?? []), ...[userId]])],
    id: "",
    created_on: currentTime,
    reminders: reminders,
    updated_on: null,
    deleted: false,
  };
  if (type === "company" || type === "company_internal") {
    const company = await isCompanyManager(userId, event.company_id ?? "");
    if (!company) {
      response.status(403).send({
        errors: {
          error: "not_manager",
        },
      });
      return;
    }
  } else if (type === "apartment") {
    const apartment = await isAuthorizedAccessToApartment(
      userId,
      event.company_id ?? "",
      event.apartment_id ?? ""
    );
    if (!apartment) {
      response.status(403).send({
        errors: {
          error: "not_tenant",
        },
      });
      return;
    }
  } else if (type === "generic") {
    if (await isAdminRole(userId)) {
      response.status(403).send({
        errors: {
          error: "not_admin",
        },
      });
      return;
    }
  }
  const id = admin.firestore().collection(EVENTS).doc().id;
  event.id = id;
  await admin.firestore().collection(EVENTS).doc(id).set(event);
  response.status(200).send(event);
};

export const responseToEvent = async (request: Request, response: Response) => {
  // @ts-ignore
  const userId = request.user?.uid;
  const event_id = request.params?.eventId;
  const accepted = request.body.accepted;
  const event = await _getEvent(userId, event_id);
  if (!event) {
    response.status(500).send({
      errors: {
        error: "event_not_found",
      },
    });
    return;
  }
  const currentTime = new Date().getTime();
  event!.updated_on = currentTime;
  if (accepted === null) {
    event.declined = event.declined?.filter((item) => item != userId) ?? [];
    event.accepted = event.accepted?.filter((item) => item != userId) ?? [];
    await admin.firestore().collection(EVENTS).doc(event!.id).update(event!);
    response.status(200).send(event);
    return;
  }
  const newList = accepted ? event!.accepted ?? [] : event.declined ?? [];
  newList?.push(userId);
  if (accepted) {
    event.declined = event.declined?.filter((item) => item != userId) ?? [];
    event.accepted = [...new Set(newList)];
  } else {
    event.accepted = event.accepted?.filter((item) => item != userId) ?? [];
    event.declined = [...new Set(newList)];
  }
  await admin.firestore().collection(EVENTS).doc(event!.id).update(event!);
  response.status(200).send(event);
};

export const editEvent = async (request: Request, response: Response) => {
  const {
    name,
    description,
    end_time,
    start_time,
    repeat,
    type,
    company_id,
    apartment_id,
    deleted,
    reminders,
    repeat_until,
    addition_invitees = [],
  } = request.body;
  const id = request.params.eventId;
  // @ts-ignore
  const userId = request.user?.uid;
  const event = await _getEvent(userId, id);
  if (!event) {
    response.status(500).send({
      errors: {
        error: "event_not_found",
      },
    });
    return;
  }
  if (event?.type === "company" || event?.type === "company_internal") {
    const company = await isCompanyManager(userId, event?.company_id ?? "");
    if (!company) {
      response.status(403).send({
        errors: {
          error: "not_manager",
        },
      });
      return;
    }
  } else if (event?.type === "apartment") {
    const apartment = await isAuthorizedAccessToApartment(
      userId,
      event?.company_id ?? "",
      event?.apartment_id ?? ""
    );
    if (!apartment) {
      response.status(403).send({
        errors: {
          error: "not_tenant",
        },
      });
      return;
    }
  } else if (event?.type === "generic") {
    if (await isAdminRole(userId)) {
      response.status(403).send({
        errors: {
          error: "not_admin",
        },
      });
      return;
    }
  }
  const currentTime = new Date().getTime();
  const displayName = await getUserDisplayName(userId, company_id);
  event.name = name ?? event?.name;
  event.description = description ?? event?.description;
  event.end_time = end_time ?? event?.end_time;
  event.start_time = start_time ?? event?.start_time;
  event.repeat = repeat ?? event?.repeat;
  event.type = type ?? event?.type;
  event.company_id = company_id ?? event?.company_id;
  event.apartment_id = apartment_id ?? event?.apartment_id;
  event.updated_on = currentTime;
  event.deleted = deleted ?? event?.deleted;
  event.reminders = reminders ?? event.reminders ?? null;
  event.updated_by = userId;
  event.repeat_until =
    repeat_until == null && repeat == null ? repeat_until : event.repeat_until;
  event.updated_by_name = displayName;
  event.invitees = [
    ...new Set([...(event.invitees ?? []), ...(addition_invitees ?? [])]),
  ];
  await admin.firestore().collection(EVENTS).doc(id).update(event);
  response.status(200).send(event);
};

export const removeFromFromEvent = async (
  request: Request,
  response: Response
) => {
  const { removed_users } = request.body;
  const id = request.params.eventId;
  // @ts-ignore
  const userId = request.user?.uid;
  const event = await _getEvent(userId, id);
  if (!event) {
    response.status(500).send({
      errors: {
        error: "event_not_found",
      },
    });
    return;
  }
  if (event.type === "company" || event.type === "company_internal") {
    const company = await isCompanyManager(userId, event?.company_id ?? "");
    if (!company) {
      response.status(403).send({
        errors: {
          error: "not_manager",
        },
      });
      return;
    }
  } else if (event.type === "apartment") {
    const apartment = await isAuthorizedAccessToApartment(
      userId,
      event.company_id ?? "",
      event.apartment_id ?? ""
    );
    if (!apartment) {
      response.status(403).send({
        errors: {
          error: "not_tenant",
        },
      });
      return;
    }
  } else if (event.type === "generic") {
    if (await isAdminRole(userId)) {
      response.status(403).send({
        errors: {
          error: "not_admin",
        },
      });
      return;
    }
  }
  event.invitees = event.invitees.filter(
    (item) => !removed_users.includes(item)
  );
  event.updated_by = userId;
  event.updated_by_name = await getUserDisplayName(
    userId,
    event.company_id ?? ""
  );
  event.updated_on = new Date().getTime();
  await admin.firestore().collection(EVENTS).doc(id).update(event);
  response.status(200).send(event);
};
