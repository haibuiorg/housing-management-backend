'use strict';
import {Request, Response} from 'express';
import admin from 'firebase-admin';
import {addMultipleApartmentsInBuilding, addTenantToApartment, getUserApartment}
  from './manage_apartment';
// eslint-disable-next-line max-len
import {APARTMENTS, CREATED_ON, DEFAULT, DEFAULT_FREE_TIER_MAX_COUNT, DEFAULT_WATER_BILL_TEMPLATE_ID, DOCUMENTS, HOUSING_COMPANIES, HOUSING_COMPANY_ID, IS_DELETED, USERS}
  from '../../constants';
import {Company} from '../../dto/company';
import {isCompanyManager, isCompanyOwner, isCompanyTenant}
  from '../authentication/authentication';
import {addHousingCompanyToUser} from '../user/manage_user';
import {getCountryData, isValidCountryCode} from '../country/manage_country';
import {UI} from '../../dto/ui';
import {copyStorageFolder, getPublicLinkForFile}
  from '../storage/manage_storage';
import {codeValidation, removeCode} from '../authentication/code_validation';
import {StorageItem} from '../../dto/storage_item';

export const createHousingCompany =
    async (request: Request, response: Response) => {
      const housingCompanyName = request.body.name;
      if (!housingCompanyName) {
        response.status(500).send(
            {errors: {
              error: 'Missing housing company name',
              code: 'invalid_name',
            }},
        );
        return;
      }

      const housingCompanyId = admin.firestore().collection(HOUSING_COMPANIES)
          .doc().id;
      const countryCode = request.body.country_code;
      const companyCountry =
          await getCountryData(countryCode?.toString() ?? 'fi');
      // @ts-ignore
      const userId = request.user?.uid;
      const housingCompany: Company = {
        id: housingCompanyId,
        name: housingCompanyName,
        owners: [userId],
        managers: [userId],
        apartment_count: 0,
        tenant_count: 1,
        is_deleted: false,
        max_account_count: companyCountry.free_tier_max_account,
        currency_code: companyCountry.currency_code,
        country_code: companyCountry.country_code,
        vat: companyCountry.vat,
        water_bill_template_id: DEFAULT_WATER_BILL_TEMPLATE_ID,
      };
      await admin.firestore().collection(HOUSING_COMPANIES)
          .doc(housingCompanyId)
          .set(housingCompany);
      await addHousingCompanyToUser(housingCompanyId, userId);
      const building = request.body.building;
      if (building) {
        const houseCodes = request.body.house_codes;
        const apartments =
            await addMultipleApartmentsInBuilding(
                housingCompanyId, building, houseCodes);
        if (apartments) {
          response.status(200).send({
            apartments: [apartments],
            id: housingCompanyId,
            name: housingCompanyName,
            owners: [userId],
            managers: [userId],
          });
          return;
        }
      }
      response.status(200).send(housingCompany);
    };

export const getHousingCompanies =
    async (request: Request, response: Response) => {
      try {
        // @ts-ignore
        const userId = request.user?.uid;
        const companyIds = (await admin.firestore()
            .collection(USERS).doc(userId)
            .collection(HOUSING_COMPANIES).listDocuments())
            .map((doc) => doc.id);
        const result: (admin.firestore.DocumentData | undefined)[] = [];
        await Promise.all(companyIds.map(async (id) => {
          try {
            const data = ((await admin.firestore()
                .collection(HOUSING_COMPANIES).doc(id).get())
                .data() as Company);
            if (data && !data.is_deleted) {
              const expiration = (Date.now() + 604000);
              if (data.cover_image_storage_link &&
                  data.cover_image_storage_link.toString().length> 0 &&
                  (data.cover_image_url_expiration ?? Date.now()) <= Date.now()
              ) {
                const coverImageUrl =
                      await getPublicLinkForFile(data.cover_image_storage_link,
                          expiration);
                data.cover_image_url = coverImageUrl;
                await admin.firestore()
                    .collection(HOUSING_COMPANIES).doc(id)
                    .update({cover_image_url: coverImageUrl,
                      cover_image_url_expiration: expiration});
              }
              if (data.logo_storage_link &&
                data.logo_storage_link.toString().length> 0 &&
                (data.logo_url_expiration ?? Date.now()) <= Date.now()) {
                const logoUrl =
                    await getPublicLinkForFile(
                        data.logo_storage_link, expiration);
                data.logo_url = logoUrl;
                await admin.firestore()
                    .collection(HOUSING_COMPANIES).doc(id)
                    .update({logo_url: logoUrl,
                      logo_url_expiration: expiration});
              }
              result.push(data);
            }
          } catch (error) {
            console.log(error);
          }
        }));
        response.status(200).send(result);
      } catch (errors) {
        console.log(errors);
        response.status(500).send({errors: errors});
      }
    };
export const getHousingCompany =
    async (request: Request, response: Response) => {
      try {
        // @ts-ignore
        const userId = request.user?.uid;
        const companyId = request.query.housing_company_id;
        if (!await isCompanyTenant(userId, companyId?.toString() ?? '')) {
          response.status(403).send({
            errors: {error: 'Not tenant', code: 'not_tenant'},
          });
          return;
        }
        const companies = (await admin.firestore()
            .collection(HOUSING_COMPANIES).where('id', '==', companyId)
            .limit(1).get())
            .docs.map((doc) => doc.data());
        const data = companies[0] as Company;
        if (data.cover_image_storage_link &&
              data.cover_image_storage_link.toString().length> 0) {
          const coverImageUrl =
                  await getPublicLinkForFile(data.cover_image_storage_link);
          data.cover_image_url = coverImageUrl;
        }
        if (data.logo_storage_link &&
            data.logo_storage_link.toString().length> 0) {
          const logoUrl =
                await getPublicLinkForFile(data.logo_storage_link);
          data.logo_url = logoUrl;
        }
        response.status(200).send(data);
      } catch (errors) {
        response.status(500).send({errors: errors});
      }
    };
export const updateHousingCompanyDetail =
    async (request: Request, response: Response) => {
      const companyId = request.body.housing_company_id;
      // @ts-ignore
      const userId = request.user?.uid;
      if (!isCompanyOwner(userId, companyId)) {
        response.status(403).send(
            {errors: {error: 'Unauthorized', code: 'not_owner'}},
        );
        return;
      }
      const streetAddress1 = request.body.street_address_1;
      const streetAddress2 = request.body.street_address_2;
      const postalCode = request.body.postal_code;
      const city = request.body.city;
      const countryCode = request.body.country_code;
      const lat = request.body.lat;
      const lng = request.body.lng;
      const name = request.body.name;
      const companyBusinessId = request.body.business_id;
      const ui = request.body.ui;
      const isDeleted = request.body.is_deleted;
      const waterBillTemplateId = request.body.water_bill_template_id;
      const coverImageStorageLink = request.body.cover_image_storage_link;
      const logoStorageLink = request.body.logo_storage_link;
      const company: Company = {
        is_deleted: false,
      };
      if (streetAddress1) {
        company.street_address_1 = streetAddress1;
      }
      if (streetAddress2) {
        company.street_address_2 = streetAddress2;
      }
      if (postalCode) {
        company.postal_code = postalCode;
      }
      if (city) {
        company.city = city;
      }
      if (countryCode) {
        const country = await isValidCountryCode(countryCode);
        company.country_code = countryCode;
        company.currency_code = country.currency_code;
        company.vat = country.vat;
      }
      if (lat) {
        company.lat = lat;
      }
      if (lng) {
        company.lng = lng;
      }
      if (name) {
        company.name = name;
      }
      if (companyBusinessId) {
        company.business_id = companyBusinessId;
      }
      if (ui) {
        company.ui = (ui as UI);
      }
      if (isDeleted) {
        if (await isCompanyOwner(userId, companyId)) {
          company.is_deleted = isDeleted;
        }
      }
      if (await isCompanyManager(userId, companyId)) {
        const expiration = (Date.now() + 604000);
        if (waterBillTemplateId) {
          company.water_bill_template_id = waterBillTemplateId;
        }
        if (coverImageStorageLink) {
          const lastPath = coverImageStorageLink.toString().split('/').at(-1);
          const newFileLocation =
              `public/companies/${companyId}/cover/${lastPath}`;
          await copyStorageFolder(
              coverImageStorageLink, newFileLocation);
          company.cover_image_storage_link = newFileLocation;
          company.cover_image_url =
            await getPublicLinkForFile(newFileLocation, expiration);
          company.cover_image_url_expiration = expiration;
        }
        if (logoStorageLink) {
          const lastPath = logoStorageLink.toString().split('/').at(-1);
          const newFileLocation =
              `public/companies/${companyId}/logo/${lastPath}`;
          await copyStorageFolder(
              logoStorageLink, newFileLocation);
          company.logo_storage_link = newFileLocation;
          company.logo_url =
            await getPublicLinkForFile(logoStorageLink, expiration);
          company.logo_url_expiration = expiration;
        }
      }


      try {
        await admin.firestore().collection(HOUSING_COMPANIES)
            .doc(companyId).update(company);
        company.id = companyId;
        response.status(200).send({result: true});
      } catch (errors) {
        response.status(500).send({errors: errors});
      };
    };


export const getCompanyData =
    async (companyId:string): Promise<Company|undefined> => {
      const company = await admin.firestore()
          .collection(HOUSING_COMPANIES).doc(companyId).get();
      return company?.data() as Company;
    };

export const hasApartment =
    async (apartmentId: string, housingCompanyId: string)
        : Promise<boolean> => {
      const apartment = await admin.firestore().collection(HOUSING_COMPANIES)
          .doc(housingCompanyId).collection(APARTMENTS).doc(apartmentId).get();
      return apartment.exists;
    };

export const getCompanyTenantIds =
  async (housingCompanyId:string,
      includeOwner: boolean = false,
      includeManager: boolean = false) : Promise<string[]> => {
    const apartments = await admin.firestore().
        collectionGroup(APARTMENTS).
        where(HOUSING_COMPANY_ID, '==', housingCompanyId).get();
    const tenants: string[] = [];
    if (includeManager || includeOwner) {
      const housingCompany = ((await
      admin.firestore().collection(HOUSING_COMPANIES)
          .doc(housingCompanyId).get())
          .data() as Company);
      if (includeManager) {
        tenants.push(...housingCompany.managers ?? []);
      }
      if (includeOwner) {
        tenants.push(...housingCompany.owners ?? []);
      }
    }
    apartments.docs.map((doc) => {
      tenants.push(...doc.data().tenants as string[]);
    });
    return [...new Set(tenants)];
  };

export const joinWithCode =
  async (request: Request, response: Response) => {
    const invitationCode = request.body.invitation_code;
    const housingCompanyId = request.body.housing_company_id;
    const apartmentId : string = await codeValidation(
        invitationCode, housingCompanyId);
    if (apartmentId.length === 0) {
      const error = {'errors': {'code': 500, 'message': 'Invalid code'}};
      console.log(error);
      response.status(500).send(error);
      return;
    }
    try {
      const company = await getCompanyData(housingCompanyId);
      console.log(company);
      if (
        (company?.tenant_count ?? 1) >=
        (company?.max_account_count ?? DEFAULT_FREE_TIER_MAX_COUNT)) {
        const error = {'errors':
          {'code': 500, 'message': 'Max account number reached'}};
        console.log(error);
        response.status(500).send(error);
        return;
      }
      // @ts-ignore
      const userId = request.user?.uid;
      await addTenantToApartment(
          userId, housingCompanyId, apartmentId);
      await removeCode(invitationCode, housingCompanyId, userId);
      const apartment =
          await getUserApartment(userId, housingCompanyId, apartmentId);
      response.status(200).send(apartment);
    } catch (errors) {
      console.error(errors);
      response.status(500).send({'errors': errors});
      return;
    }
    return;
  };

export const addDocumentToCompany =
  async (request: Request, response: Response ) => {
    // @ts-ignore
    const userId = request.user?.uid;
    const companyId = request.body?.housing_company_id;
    const company = await isCompanyManager(userId, companyId);
    if (!company) {
      response.status(403).send(
          {errors: {error: 'Unauthorized', code: 'not_manager'}},
      );
      return;
    }
    const type = request.body?.type?.toString() ?? DEFAULT;
    const storageItems = request.body.storage_items;
    const storageItemArray:StorageItem[] = [];
    if (storageItems && storageItems.length > 0) {
      const createdOn = new Date().getTime();
      await Promise.all(storageItems.map(async (link: string) => {
        try {
          const lastPath = link.toString().split('/').at(-1);
          const newFileLocation =
                `${HOUSING_COMPANIES}/${companyId}/${type}/${lastPath}`;
          await copyStorageFolder(link, newFileLocation);
          const id = admin.firestore().collection(HOUSING_COMPANIES)
              .doc(companyId).collection(DOCUMENTS).doc().id;
          const storageItem: StorageItem = {
            type: type,
            name: lastPath ?? '',
            id: id, is_deleted: false, uploaded_by: userId,
            storage_link: newFileLocation, created_on: createdOn,
          };
          await admin.firestore().collection(HOUSING_COMPANIES)
              .doc(companyId).collection(DOCUMENTS).doc(id).set(storageItem);
          storageItemArray.push(storageItem);
        } catch (error) {
          response.status(500).send(
              {errors: error},
          );
          console.log(error);
        }
      }));
    }
    response.status(200).send(storageItemArray);
  };

export const getCompanyDocuments =
  async (request:Request, response: Response) => {
    // @ts-ignore
    const userId = request.user?.uid;
    const companyId = request.query?.housing_company_id;
    const isTenant =
      await isCompanyTenant(
          userId,
          companyId?.toString() ?? '',
      );
    if (!isTenant) {
      response.status(403).send(
          {errors: {error: 'Unauthorized', code: 'not_tenant'}},
      );
      return;
    }
    let basicRef = admin.firestore()
        .collection(HOUSING_COMPANIES).doc(companyId?.toString() ?? '')
        .collection(DOCUMENTS)
        .where(IS_DELETED, '==', false);
    const type = request.query.type;
    if (type) {
      basicRef = basicRef.where('type', '==', type.toString());
    }
    const documents = (await basicRef.orderBy(CREATED_ON, 'desc').get())
        .docs.map((doc) => doc.data());
    response.status(200).send(documents);
  };

export const updateCompanyDocument =
  async (request:Request, response: Response) => {
    // @ts-ignore
    const userId = request.user?.uid;
    const companyId = request.body?.housing_company_id;
    const isTenant =
      await isCompanyManager(
          userId,
          companyId?.toString() ?? '',
      );
    if (!isTenant) {
      response.status(403).send(
          {errors: {error: 'Unauthorized', code: 'not_tenant'}},
      );
      return;
    }
    const updatedFile: StorageItem = {
    };
    if (request.body?.is_deleted) {
      updatedFile.is_deleted = request.body?.is_deleted;
    }
    if (request.body?.name) {
      updatedFile.name = request.body?.name;
    }
    const docId = request.params?.document_id;
    await admin.firestore()
        .collection(HOUSING_COMPANIES).doc(companyId?.toString() ?? '')
        .collection(DOCUMENTS).doc(docId).update(updatedFile);
    const basicRef = admin.firestore()
        .collection(HOUSING_COMPANIES).doc(companyId?.toString() ?? '')
        .collection(DOCUMENTS)
        .doc(docId);
    const document = (await basicRef.get()).data();
    response.status(200).send(document);
  };


export const getCompanyDocument =
  async (request:Request, response: Response) => {
    // @ts-ignore
    const userId = request.user?.uid;
    const companyId = request.params?.housing_company_id;
    const docId = request.params?.document_id;
    const isTenant =
      await isCompanyTenant(
          userId,
          companyId?.toString() ?? '',
      );
    if (!isTenant) {
      response.status(403).send(
          {errors: {error: 'Unauthorized', code: 'not_tenant'}},
      );
      return;
    }
    const document = (await admin.firestore()
        .collection(HOUSING_COMPANIES).doc(companyId?.toString() ?? '')
        .collection(DOCUMENTS).doc(docId).get()).data() as StorageItem;
    if (document?.expired_on ?? 0 < new Date().getTime()) {
      document.expired_on = new Date().getTime();
      document.presigned_url =
        await getPublicLinkForFile(document.storage_link ?? '');
      admin.firestore()
          .collection(HOUSING_COMPANIES).doc(companyId?.toString() ?? '')
          .collection(DOCUMENTS).doc(docId).update(document);
    }
    response.status(200).send(document);
  };
