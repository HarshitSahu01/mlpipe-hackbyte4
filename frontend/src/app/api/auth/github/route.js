import { NextResponse } from "next/server";
import axios from "axios";
import jwt from "jsonwebtoken";
import { connectDB } from "@/lib/mongoose";
import User from "@/models/User";

export async function POST(req) {
  try {
    const { code } = await req.json();

    // 1. Exchange code for access token
    const tokenRes = await axios.post(
      "https://github.com/login/oauth/access_token",
      {
        client_id: process.env.GITHUB_ID,
        client_secret: process.env.GITHUB_SECRET,
        code,
      },
      { headers: { Accept: "application/json" } },
    );

    const access_token = tokenRes.data.access_token;

    // 2. Get user profile
    const userRes = await axios.get("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const emailRes = await axios.get("https://api.github.com/user/emails", {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const primaryEmail = emailRes.data.find((e) => e.primary).email;

    await connectDB();

    let user = await User.findOne({ email: primaryEmail });

    if (!user) {
      user = await User.create({
        name: userRes.data.name || userRes.data.login,
        email: primaryEmail,
        image: userRes.data.avatar_url,
        provider: "github",
        providerId: userRes.data.id.toString(),
      });
    }

    const token = jwt.sign(
      {
        userId: user._id,
        email: user.email,
        role: user.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    const response = NextResponse.json({ message: "GitHub login success" });

    console.log("response of google is: ", response);

    response.cookies.set("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });

    return response;
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "GitHub auth failed" }, { status: 401 });
  }
}
