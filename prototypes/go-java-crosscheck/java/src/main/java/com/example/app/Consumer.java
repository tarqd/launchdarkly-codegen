// PROTOTYPE consumer: call sites against the generated classes. Never run against a real project.
package com.example.app;

import com.example.flags.BillingFlags;
import com.example.flags.CheckoutFlags;
import com.example.flags.UntaggedFlags;
import com.launchdarkly.sdk.LDContext;
import com.launchdarkly.sdk.LDValue;
import com.launchdarkly.sdk.server.Components;
import com.launchdarkly.sdk.server.LDClient;
import com.launchdarkly.sdk.server.LDConfig;

/** Prototype call sites. */
public final class Consumer {
  /** Not instantiable. */
  private Consumer() {}

  /**
   * Evaluates a few flags against an offline client.
   *
   * @param args unused
   * @throws Exception on close
   */
  public static void main(String[] args) throws Exception {
    LDConfig config = new LDConfig.Builder().offline(true).events(Components.noEvents()).build();
    try (LDClient client = new LDClient("sdk-key", config)) {
      LDContext user = LDContext.create("user-1");
      CheckoutFlags checkout = new CheckoutFlags(client);
      UntaggedFlags untagged = new UntaggedFlags(client);
      BillingFlags billing = new BillingFlags(client);
      System.out.println(checkout.checkout(user, false));
      System.out.println(untagged.maxItems(user, 10) + " " + untagged.bigQuota(user, 1));
      System.out.println(untagged.defaultFlag(user, "x") + " " + untagged.wait(user, true));
      System.out.println(billing.checkoutConfig(user, LDValue.ofNull()));
      System.out.println(untagged.maxItemsDetail(user, 10).getReason());
    }
  }
}
