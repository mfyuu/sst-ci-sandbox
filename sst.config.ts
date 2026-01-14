/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "sst-console-sandbox",
      removal: input?.stage === "production" ? "retain" : "remove",
      protect: ["production"].includes(input?.stage),
      home: "aws",
    };
  },
  async run() {
    // Lambda Function URL に lambda:InvokeFunction 権限を追加
    // https://github.com/anomalyco/sst/issues/6198
    $transform(aws.lambda.FunctionUrl, (args, _opts, name) => {
      new aws.lambda.Permission(`${name}InvokePermission`, {
        action: "lambda:InvokeFunction",
        function: args.functionName,
        principal: "*",
        statementId: "FunctionURLInvokeAllowPublicAccess",
      });
    });

    new sst.aws.Nextjs("MyWeb");
  },
});
