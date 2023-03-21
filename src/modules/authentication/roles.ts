import admin from "firebase-admin";
import { ROLES } from "../../constants";
export const getRoleNames = async (roleId: string): Promise<string> => {
  const roleName = await admin.firestore().collection(ROLES).doc(roleId).get();
  if (roleName.exists) {
    return roleName.data()?.name;
  }
  return "";
};

export const getRoleId = async (roleName: string): Promise<string> => {
  const roles = await admin
    .firestore()
    .collection(ROLES)
    .where("name", "==", roleName)
    .limit(1)
    .get();
  if (roles.size > 0) {
    return roles.docs.map((doc) => doc.data())[0].name;
  }
  return "";
};
