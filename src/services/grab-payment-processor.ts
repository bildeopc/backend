import Stripe from "stripe"
import { EOL } from "os"
import { 
    AbstractPaymentProcessor, 
    PaymentProcessorContext, 
    PaymentProcessorError, 
    PaymentProcessorSessionResponse, 
    PaymentSessionStatus,
    isPaymentProcessorError,
  } from "@medusajs/medusa"
  
const ErrorCodes = {
    PAYMENT_INTENT_UNEXPECTED_STATE: "payment_intent_unexpected_state",
  }
const ErrorIntentStatus = {
    SUCCEEDED: "succeeded",
    CANCELED: "canceled",
  }

  
  interface StripeOptions {
    api_key: string
    webhook_secret: string
    /**
     * Use this flag to capture payment immediately (default is false)
     */
    capture?: boolean
    /**
     * set `automatic_payment_methods` to `{ enabled: true }`
     */
    automatic_payment_methods?: boolean
    /**
     * Set a default description on the intent if the context does not provide one
     */
    payment_description?: string
  }

  class GrabPaymentProcessor extends AbstractPaymentProcessor {
  
    static identifier = "grab-payment"
    protected readonly options_: StripeOptions
    protected stripe_: Stripe
  
    protected constructor(_, options) {
      super(_, options)
  
      this.options_ = options
      
      this.init()
    }

    protected init(): void {
      this.stripe_ =
        this.stripe_ ||
        new Stripe(this.options_.api_key, {
          apiVersion: "2022-11-15",
        })
    }

    async capturePayment(
      paymentSessionData: Record<string, unknown>
    ): Promise<
      PaymentProcessorError | PaymentProcessorSessionResponse["session_data"]
    > {
      const id = paymentSessionData.id as string
      try {
        const intent = await this.stripe_.paymentIntents.capture(id)
        return intent as unknown as PaymentProcessorSessionResponse["session_data"]
      } catch (error) {
        if (error.code === ErrorCodes.PAYMENT_INTENT_UNEXPECTED_STATE) {
          if (error.payment_intent?.status === ErrorIntentStatus.SUCCEEDED) {
            return error.payment_intent
          }
        }
  
        return this.buildError("An error occurred in capturePayment", error)
      }
    }
    async authorizePayment(
    paymentSessionData: Record<string, unknown>, 
    context: Record<string, unknown>
  ): Promise<
    PaymentProcessorError | 
    { 
      status: PaymentSessionStatus; 
      data: Record<string, unknown>; 
    }
  > {
    return {
      status: PaymentSessionStatus.AUTHORIZED,
      data: {
        id: "test",
      },
    }
  }
    async cancelPayment(
      paymentSessionData: Record<string, unknown>
    ): Promise<Record<string, unknown> | PaymentProcessorError> {
      throw new Error("Method not implemented.")
    }
    async initiatePayment(
      context: PaymentProcessorContext
    ): Promise<PaymentProcessorError | PaymentProcessorSessionResponse> {
      const intentRequestData = {
  payment_method_types: ["grabpay"]

      }
      const {
        email,
        context: cart_context,
        currency_code,
        amount,
        resource_id,
        customer,
      } = context
  
      const description = (cart_context.payment_description ??
        this.options_?.payment_description) as string
  
      const intentRequest: Stripe.PaymentIntentCreateParams = {
        description,
        amount: Math.round(amount),
        currency: currency_code,
        metadata: { resource_id },
        // ...intentRequestData,
      }
  
      if (this.options_?.automatic_payment_methods) {
        intentRequest.automatic_payment_methods = { enabled: true }
      }
  
      if (customer?.metadata?.stripe_id) {
        intentRequest.customer = customer.metadata.stripe_id as string
      } else {
        let stripeCustomer
        try {
          stripeCustomer = await this.stripe_.customers.create({
            email,
          })
        } catch (e) {
          return this.buildError(
            "An error occurred in initiatePayment when creating a Stripe customer",
            e
          )
        }
  
        intentRequest.customer = stripeCustomer.id
      }
  
    

      let session_data
      try {
        const strip = new Stripe(process.env.STRIPE_API_KEY,{apiVersion:"2022-11-15"})
        session_data = (await strip.paymentIntents.create(
          intentRequest
        )) as unknown as Record<string, unknown>
      } catch (e) {
        return this.buildError(
          "An error occurred in InitiatePayment during the creation of the stripe payment intent",
          e
        )
      }
  
      return {
        session_data,
        update_requests: customer?.metadata?.stripe_id
          ? undefined
          : {
              customer_metadata: {
                stripe_id: intentRequest.customer,
              },
            },
      }
    }
    async deletePayment(
      paymentSessionData: Record<string, unknown>
    ): Promise<Record<string, unknown> | PaymentProcessorError> {
      return paymentSessionData
    }
    async getPaymentStatus(
      paymentSessionData: Record<string, unknown>
    ): Promise<PaymentSessionStatus> {
      throw new Error("Method not implemented.")
    }
    async refundPayment(
      paymentSessionData: Record<string, unknown>, 
      refundAmount: number
    ): Promise<Record<string, unknown> | PaymentProcessorError> {
      throw new Error("Method not implemented.")
    }
    async retrievePayment(
      paymentSessionData: Record<string, unknown>
    ): Promise<Record<string, unknown> | PaymentProcessorError> {
      throw new Error("Method not implemented.")
    }
    async updatePayment(
      context: PaymentProcessorContext
    ): Promise<
      void | 
      PaymentProcessorError | 
      PaymentProcessorSessionResponse
    > {
      throw new Error("Method not implemented.")
    }

    protected buildError(
      message: string,
      e: Stripe.StripeRawError | PaymentProcessorError | Error
    ): PaymentProcessorError {
      return {
        error: message,
        code: "code" in e ? e.code : "",
        detail: isPaymentProcessorError(e)
          ? `${e.error}${EOL}${e.detail ?? ""}`
          : "detail" in e
          ? e.detail
          : e.message ?? "",
      }
    }

  }
  
export default GrabPaymentProcessor