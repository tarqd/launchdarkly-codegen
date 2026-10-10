namespace Consumer
{
    using MyApp.FeatureFlags;
    using LaunchDarkly.Sdk;
    using LaunchDarkly.Sdk.Server.Interfaces;

    /// <summary>Calls every generated member.</summary>
    public static class Calls
    {
        /// <summary>Calls every generated member.</summary>
        /// <param name="client">The client.</param>
        /// <returns>A summary string.</returns>
        public static string Run(ILdClient client)
        {
            var flags = new Flags(client);
            var context = Context.New("user-key");
            bool a = flags.CheckoutV2(context, false);
            EvaluationDetail<bool> b = flags.CheckoutV2Detail(context, false);
            string c = flags.PricingTier(context, "basic");
            EvaluationDetail<string> d = flags.PricingTierDetail(context, "basic");
#pragma warning disable CS0618 // calls a deprecated flag on purpose
            double e = flags.MaxCartItems(context, 1.5);
            EvaluationDetail<double> f = flags.MaxCartItemsDetail(context, 1.5);
            string g = FlagKeys.MaxCartItems;
#pragma warning restore CS0618
            LdValue h = flags.CheckoutConfig(context, LdValue.Null);
            EvaluationDetail<LdValue> i = flags.CheckoutConfigDetail(context, LdValue.Null);
            return string.Join(",", a, b.Value, c, d.Value, e, f.Value, g, h, i.Value, FlagKeys.CheckoutV2, FlagKeys.PricingTier, FlagKeys.CheckoutConfig);
        }
    }
}
