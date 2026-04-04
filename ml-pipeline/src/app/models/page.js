// src/app/models/page.js
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import jwt from "jsonwebtoken";
import { connectDB } from "@/lib/mongoose";
import MLModel from "@/models/Model";
import Sidebar from "@/components/Sidebar";
import User from "@/models/User";
import ModelsClient from "./ModelsClient";

export default async function ModelsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (!token) redirect("/auth/login");

  let session;
  try {
    session = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    redirect("/auth/login");
  }

  await connectDB();
  const [user, models] = await Promise.all([
    User.findById(session.userId).lean(),
    MLModel.find({ ownerId: session.userId }).sort({ createdAt: -1 }).lean(),
  ]);

  // Serialize for client
  const serialized = models.map((m) => ({
    ...m,
    _id: m._id.toString(),
    ownerId: m.ownerId.toString(),
    createdAt: m.createdAt?.toISOString?.() ?? null,
  }));

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar user={user} />
      <ModelsClient models={serialized} />
    </div>
  );
}
