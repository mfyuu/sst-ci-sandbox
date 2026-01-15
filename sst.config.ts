/// <reference path="./.sst/platform/config.d.ts" />

const APP_NAME = "sst-ci-sandbox";
const AWS_REGION = "ap-northeast-1";
const ENV_KEYS = ["MY_ENV_VAR1", "MY_ENV_VAR2"] as const;

type EnvRecord = Record<(typeof ENV_KEYS)[number], string>;

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
    // 動的インポート（SSTの制約: トップレベルimport不可）
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
          return JSON.parse(result.SecretString) as Record<string, string>;
        }
        return undefined;
      } catch {
        return undefined;
      }
    }

    async function getEnvFromSecretsManager(stage: string): Promise<EnvRecord> {
      const client = new SecretsManagerClient({ region: AWS_REGION });

      // 1. stage固有のシークレットを探す
      let secrets = await getSecretJson(client, `${APP_NAME}/${stage}`);
      // 2. なければdefaultにフォールバック
      if (!secrets) {
        secrets = await getSecretJson(client, `${APP_NAME}/default`);
      }
      if (!secrets) {
        throw new Error(
          `Missing secrets: ${APP_NAME}/${stage} or ${APP_NAME}/default`
        );
      }

      // 必要なキーが全て存在するか確認
      const env = {} as EnvRecord;
      for (const key of ENV_KEYS) {
        const value = secrets[key];
        if (!value) {
          throw new Error(`Missing key in secrets: ${key}`);
        }
        env[key] = value;
      }
      return env;
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
