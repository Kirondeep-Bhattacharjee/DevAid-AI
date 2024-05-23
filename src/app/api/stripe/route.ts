import { db } from "@/lib/db";
import { userSubscriptions } from "@/lib/db/schema";
import { stripe } from "@/lib/stripe";
import { currentUser, getAuth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { NextResponse, NextRequest } from "next/server";

const return_url = process.env.NEXT_BASE_URL + "/";

export async function GET(req: NextRequest) {
  try {
    // Get the authentication details from the request
    const { userId } = getAuth(req);

    // If no user ID is found, return unauthorized response
    if (!userId) {
      return new NextResponse("unauthorized", { status: 401 });
    }

    // Fetch the current user details
    const user = await currentUser();

    // Fetch user subscriptions from the database
    const _userSubscriptions = await db
      .select()
      .from(userSubscriptions)
      .where(eq(userSubscriptions.userId, userId));

    // If the user has a Stripe customer ID, create a billing portal session
    if (_userSubscriptions[0] && _userSubscriptions[0].stripeCustomerId) {
      const stripeSession = await stripe.billingPortal.sessions.create({
        customer: _userSubscriptions[0].stripeCustomerId,
        return_url,
      });
      return NextResponse.json({ url: stripeSession.url });
    }

    // If the user is subscribing for the first time, create a Stripe checkout session
    const stripeSession = await stripe.checkout.sessions.create({
      success_url: return_url,
      cancel_url: return_url,
      payment_method_types: ["card"],
      mode: "subscription",
      billing_address_collection: "auto",
      customer_email: user?.emailAddresses[0].emailAddress,
      line_items: [
        {
          price_data: {
            currency: "in", // Use a valid currency code
            product_data: {
              name: "DevAid AI Pro",
              description: "Unlimited PDF sessions!",
            },
            unit_amount: 2000, // This is the price in cents (2000 cents = $20.00)
            recurring: {
              interval: "month",
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        userId,
      },
    });

    // Return the URL of the Stripe session
    return NextResponse.json({ url: stripeSession.url });
  } catch (error) {
    console.error("stripe error", error);
    return new NextResponse("internal server error", { status: 500 });
  }
}
