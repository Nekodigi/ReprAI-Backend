import { firestore } from "firebase-admin";
import { Session } from "./type";

export const sessionConverter = {
  toFirestore: (session: Session) => {
    return {
      id: session.id,
      last_text: session.last_text,
      last_updated: firestore.Timestamp.fromDate(session.last_updated),
      cache_result: session.cache_result,
    };
  },
  fromFirestore: (snapshot: FirebaseFirestore.QueryDocumentSnapshot) => {
    const data = snapshot.data();
    return {
      id: data.id,
      last_text: data.last_text,
      last_updated: data.last_updated.toDate(),
      cache_result: data.cache_result,
    } as Session;
  },
};
export const getSession = async (
  fs: FirebaseFirestore.CollectionReference,
  sid: string
) => {
  const doc = await fs
    .doc("sessions")
    .collection("list")
    .doc(sid)
    .withConverter(sessionConverter)
    .get();
  return doc.data();
};
