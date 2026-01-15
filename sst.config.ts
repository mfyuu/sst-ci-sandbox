/// <reference path="./.sst/platform/config.d.ts" />

const APP_NAME = "sst-ci-sandbox";
const AWS_REGION = "ap-northeast-1";

export default $config({
  app(input) {
    return {
      name: APP_NAME,
      removal: input?.stage === "production" ? "retain" : "remove",
      protect: ["production"].includes(input?.stage),
      home: "aws",
    };
  },
  async run() {
    const {
      SecretsManagerClient,
      GetSecretValueCommand,
    } = await import("@aws-sdk/client-secrets-manager");

    async function getSecretJson(
      client: InstanceType<typeof SecretsManagerClient>,
      secretName: string
    ): Promise<Record<string, string> | undefined> {
      try {
        const result = await client.send(
          new GetSecretValueCommand({ SecretId: secretName })
        );
        if (result.SecretString) {
          return JSON.parse(result.SecretString);
        }
        return undefined;
      } catch {
        return undefined;
      }
    }

    async function getEnvFromSecretsManager(
      stage: string
    ): Promise<Record<string, string>> {
      const client = new SecretsManagerClient({ region: AWS_REGION });
      const secrets =
        (await getSecretJson(client, `${APP_NAME}/${stage}`)) ??
        (await getSecretJson(client, `${APP_NAME}/default`));
      if (!secrets) {
        throw new Error(
          `Missing secrets: ${APP_NAME}/${stage} or ${APP_NAME}/default`
        );
      }
      return secrets;
    }

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

    // Secrets Managerから環境変数を取得
    const stage = $app.stage;
    const env = await getEnvFromSecretsManager(stage);

    new sst.aws.Nextjs("MyWeb", {
      environment: env,
    });
  },
});
