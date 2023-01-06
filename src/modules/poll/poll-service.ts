/* eslint-disable camelcase */
import {Request, Response} from 'express';
import {Poll, VotingOption} from '../../dto/poll';
import admin from 'firebase-admin';
import {isAdminRole, isCompanyManager}
  from '../authentication/authentication';
import {getUserDisplayName} from '../user/manage_user';
import {CREATED_ON, POLLS} from '../../constants';
import {getUserApartments} from '../housing/manage_apartment';

export const getPolls =async (request:Request, response: Response) => {
  // @ts-ignore
  const userId = request.user?.uid;
  const {
    company_id,
    types,
    include_ended_poll = false,
    limit = 10,
    include_deleted = false,
  } = request.query;
  let query = null;
  if (!company_id) {
    query = admin.firestore().collection(POLLS)
        .where('invitees', 'array-contains', userId?.toString());
  } else {
    const tenants =
     await getUserApartments(userId, company_id?.toString()?? '');
    const isManager =
        await isCompanyManager(userId, company_id?.toString()?? '') ||
        await isAdminRole(userId);
    const hasAccessToCompany = tenants.length> 0 || isManager;
    if (!hasAccessToCompany ||
      (types &&
        (types as String[]).includes('company_internal') && !isManager)) {
      response.status(500).send({
        'errors': {
          'error': 'no_company_found',
        },
      });
      return;
    }
    query = admin.firestore().collection(POLLS)
        .where('company_id', '==', company_id);
  }
  if (types) {
    query = query.where('type', 'in', [types]);
  }
  if (!include_ended_poll) {
    query = query.where('ended_on', '<=', new Date().getTime());
  }

  if (!include_deleted) {
    query = query ?
      query.where('deleted', '==', false):
      admin.firestore().collection(POLLS)
          .where('deleted', '==', false);
  }
  query = query.orderBy(CREATED_ON, 'desc');
  if (limit) {
    query = query.limit(parseInt(limit!.toString()));
  }

  if (request.query.last_created_on) {
    query = query.startAfter(
        parseInt(request.query.last_created_on?.toString() ?? '0') ??
        new Date().getTime());
  }
  const result = (await query.get()).docs.map((doc) => doc.data());
  response.status(200).send(result);
};

export const getPoll =async (request:Request, response: Response) => {
// @ts-ignore
  const userId = request.user?.uid;
  const poll_id = request.params?.pollId;
  const poll = await _getPoll(userId, poll_id);
  if (!poll) {
    response.status(500).send({
      errors: {
        error: 'poll_not_found',
      },
    });
  }
  response.status(200).send(poll);
  return;
};

const _getPoll =async (userId: string, pollId:string) => {
  const poll = (await admin.firestore()
      .collection(POLLS).doc(pollId).get()).data() as Poll;
  if (poll.invitees?.includes(userId)) {
    return poll;
  }
  return null;
};

export const createPoll =async (request:Request, response: Response) => {
  // @ts-ignore
  const userId = request.user?.uid;
  const {
    name,
    description,
    type = 'personal',
    invitees,
    expandable = false,
    annonymous = false,
    company_id = '',
    ended_on,
    multiple = false,
    voting_options,
  } = request.body;
  const currentTime = new Date().getTime();
  let dynamicId = -1;
  const userDisplayName = await getUserDisplayName(userId, company_id);
  const processVotingOptions : VotingOption[] = voting_options?.map(
      (option: string) => {
        dynamicId++;
        return {
          id: dynamicId,
          description: option,
          voters: [],
          added_by_name: userDisplayName,
          added_by_user_id: userId,
        };
      },
  );
  const poll: Poll = {
    name: name,
    description: description,
    type: type ?? 'personal',
    company_id: company_id,
    ended_on: ended_on ?? currentTime + 604800000,
    invitees: [...new Set([...invitees ?? [], ...[userId]])],
    id: '',
    created_on: currentTime,
    updated_on: null,
    deleted: false,
    expandable: expandable ?? false,
    annonymous: annonymous ?? false,
    multiple: multiple ?? false,
    voting_options: processVotingOptions,
    created_by: userId,
    created_by_name: userDisplayName,
    updated_by: null,
    updated_by_name: null,
  };
  if (type === 'company' || type === 'company_internal') {
    const company = await isCompanyManager(userId, poll.company_id ?? '');
    if (!company) {
      response.status(403).send({
        errors: {
          error: 'not_manager',
        },
      });
      return;
    }
  } else if (type === 'generic') {
    if (await isAdminRole(userId)) {
      response.status(403).send({
        errors: {
          error: 'not_admin',
        },
      });
      return;
    }
  }
  const id = admin.firestore()
      .collection(POLLS).doc().id;
  poll.id = id;
  await admin.firestore()
      .collection(POLLS).doc(id).set(poll);
  response.status(200).send(poll);
};

export const editPoll = async (request:Request, response: Response) => {
  const {
    name,
    description,
    ended_on,
    multiple,
    expandable,
    company_id,
    deleted,
    addition_invitees = [],
  } = request.body;
  // @ts-ignore
  const userId = request.user?.uid;
  const id = request.params.pollId;
  const poll = await _getPoll(userId, id);
  if (!poll) {
    response.status(500).send({
      errors: {
        error: 'poll_not_found',
      },
    });
    return;
  }
  if (poll?.type === 'company' || poll?.type === 'company_internal') {
    const company = await isCompanyManager(userId, poll?.company_id ?? '');
    if (!company) {
      response.status(403).send({
        errors: {
          error: 'not_manager',
        },
      });
      return;
    }
  } else if (poll?.type === 'message') {
    /* const apartment =
            await isAuthorizedAccessToApartment(
                userId, event?.company_id ?? '', event?.apartment_id ?? '');
    if (!apartment) {
      response.status(403).send({
        errors: {
          error: 'not_tenant',
        },
      });
      return;
    }*/
  } else if (poll?.type === 'generic') {
    if (await isAdminRole(userId)) {
      response.status(403).send({
        errors: {
          error: 'not_admin',
        },
      });
      return;
    }
  }
  const currentTime = new Date().getTime();
  const displayName = await getUserDisplayName(userId, company_id);
  poll.name = name ?? poll?.name;
  poll.description = description ?? poll?.description;
  poll.company_id= company_id ?? poll?.company_id;
  poll.updated_on = currentTime;
  poll.multiple = multiple ?? poll?.multiple,
  poll.deleted = deleted ?? poll?.deleted;
  poll.updated_by = userId;
  poll.updated_by_name = displayName;
  poll.expandable = expandable ?? poll.expandable;
  poll.ended_on = ended_on ?? poll.ended_on;
  poll.invitees =
    [...new Set([...poll.invitees ?? [], ...addition_invitees ?? []])];
  await admin.firestore().collection(POLLS).doc(id).update(poll);
  response.status(200).send(poll);
};

export const addPollOption = async (request:Request, response: Response) => {
  const {
    voting_options,
  } = request.body;
  const id = request.params.pollId;
  // @ts-ignore
  const userId = request.user?.uid;
  const poll = await _getPoll(userId, id);
  if (!poll) {
    response.status(500).send({
      errors: {
        error: 'poll_not_found',
      },
    });
    return;
  }
  if (!poll.expandable &&
        // not company and not manager
        !((poll.type === 'company' || poll.type=== 'company_internal') &&
            await isCompanyManager(userId, poll?.company_id ?? ''))) {
    response.status(500).send({
      errors: {
        error: 'cannot_add_option',
      },
    });
    return;
  }
  if (poll.type === 'generic' && !(await isAdminRole(userId))) {
    response.status(403).send({
      errors: {
        error: 'no_permission',
      },
    });
    return;
  }
  const currentTime = new Date().getTime();
  const displayName = await getUserDisplayName(userId, poll?.company_id ?? '');
  const currentVotingOption = poll?.voting_options?.sort((a, b) => a.id - b.id);
  if (currentVotingOption.length <2) {
    response.status(500).send({
      errors: {
        error: 'Options must be at least 1',
      },
    });
    return;
  }
  const lastId = currentVotingOption?.[(currentVotingOption?.length ?? 1)-1].id;
  voting_options.forEach((option: string) => {
    currentVotingOption?.push({
      id: (lastId ?? 0) + 1,
      description: option,
      voters: [],
      added_by_name: displayName,
      added_by_user_id: userId,
    });
  });
  poll.voting_options = currentVotingOption ?? [];
  poll.updated_on = currentTime;
  await admin.firestore().collection(POLLS).doc(id).update(poll);
  response.status(200).send(poll);
};


export const removePollOption = async (request:Request, response: Response) => {
  const {
    voting_option_id,
  } = request.body;
  const id = request.params.pollId;
  // @ts-ignore
  const userId = request.user?.uid;
  const poll = await _getPoll(userId, id);
  if (!poll) {
    response.status(500).send({
      errors: {
        error: 'poll_not_found',
      },
    });
    return;
  }
  const companyManager = await isCompanyManager(userId, poll.company_id ?? '');
  if ((poll.type === 'company' || poll.type === 'company_internal' &&
    !(companyManager))&& poll.created_by != userId) {
    response.status(403).send({
      errors: {
        error: 'no_permission',
      },
    });
    return;
  }
  const currentVotingOption = poll?.voting_options;
  const newOptions = currentVotingOption
      .filter((option)=> option.id !== parseInt(voting_option_id));
  poll.voting_options = newOptions;
  await admin.firestore().collection(POLLS).doc(id).update(poll);
  response.status(200).send(poll);
};

export const selectPollOption = async (request:Request, response: Response) => {
  const {
    voting_option_id,
  } = request.body;
  const id = request.params.pollId;
  // @ts-ignore
  const userId = request.user?.uid;
  const poll = await _getPoll(userId, id);
  if (!poll) {
    response.status(500).send({
      errors: {
        error: 'poll_not_found',
      },
    });
    return;
  }
  const pollOptions = poll.voting_options;
  pollOptions.forEach((item) => {
    if (item.id === parseInt(voting_option_id)) {
      if (item.voters.includes(userId)) {
        item.voters = item.voters.filter((voter) => voter !== userId);
      } else {
        item.voters = [...new Set([...item.voters, ...[userId]])];
      }
    } else if (item.voters.includes(userId) && !poll.multiple) {
      item.voters = item.voters.filter((voter) => voter !== userId);
    }
  });
  poll.voting_options = pollOptions;
  await admin.firestore().collection(POLLS).doc(id).update(poll);
  response.status(200).send(poll);
};

