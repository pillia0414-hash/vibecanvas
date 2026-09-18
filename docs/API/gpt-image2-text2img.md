# GPT Image-2 - Text to Image

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /api/v1/jobs/createTask:
    post:
      summary: GPT Image-2 - Text to Image
      deprecated: false
      description: >-
        ## Create Task


        Use this endpoint to create a new text-to-image generation task.


        <Card title="Get Task Details" icon="lucide-search"
        href="/market/common/get-task-detail">
          After submission, use the unified query endpoint to check task progress and retrieve results
        </Card>


        ::: tip[]

        For production use, we recommend providing the `callBackUrl` parameter
        so your service can receive completion notifications instead of polling
        for task status.

        :::


        ## Related Resources


        <CardGroup cols={2}>
          <Card title="Model Marketplace" icon="lucide-store" href="/market/quickstart">
            Explore all available models and capabilities
          </Card>
          <Card title="Common API" icon="lucide-cog" href="/common-api/get-account-credits">
            Check account credits and usage
          </Card>
        </CardGroup>
      operationId: gpt-image-2-text-to-image
      tags:
        - docs/en/Market/Image    Models/GPT Image
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required:
                - model
                - input
              properties:
                model:
                  type: string
                  description: >-
                    The model name used for generation. This field is required.
                    This endpoint must use the `gpt-image-2-text-to-image`
                    model.
                  enum:
                    - gpt-image-2-text-to-image
                  default: gpt-image-2-text-to-image
                  x-apidog-enum:
                    - value: gpt-image-2-text-to-image
                      name: ''
                      description: ''
                  examples:
                    - gpt-image-2-text-to-image
                callBackUrl:
                  type: string
                  format: uri
                  description: >-
                    Callback URL for task completion notifications. Optional
                    parameter. If provided, the system will send a POST request
                    to this URL when the task completes, whether it succeeds or
                    fails. If omitted, no callback notification will be sent.
                  examples:
                    - https://your-domain.com/api/callback
                input:
                  type: object
                  description: Input parameters for the text-to-image task.
                  required:
                    - prompt
                  properties:
                    prompt:
                      type: string
                      description: Text prompt. Required, maximum 20,000 characters.
                      minLength: 1
                      maxLength: 20000
                      examples:
                        - >-
                          A cinematic night city poster with neon reflections on
                          a rainy street.
                    aspect_ratio:
                      type: string
                      description: >-
                        The aspect ratio of the generated image is set to auto
                        by default.

                        Note: for 2K resolution, the following aspect ratios are
                        not supported: 5:4, 4:5, 3:1, 1:3, and 9:21.

                        for 4K resolution, the following aspect ratios are not
                        supported: 3:1, 1:3, and 9:21.
                      enum:
                        - auto
                        - '1:1'
                        - '3:2'
                        - '2:3'
                        - '4:3'
                        - '3:4'
                        - '5:4'
                        - '4:5'
                        - '16:9'
                        - '9:16'
                        - '2:1'
                        - '1:2'
                        - '3:1'
                        - '1:3'
                        - '21:9'
                        - '9:21'
                      x-apidog-enum:
                        - label: auto
                          value: auto
                          description: ''
                        - label: '1:1'
                          value: '1:1'
                          description: ''
                        - label: '3:2'
                          value: '3:2'
                          description: ''
                        - label: '2:3'
                          value: '2:3'
                          description: ''
                        - label: '4:3'
                          value: '4:3'
                          description: ''
                        - label: '3:4'
                          value: '3:4'
                          description: ''
                        - label: '5:4'
                          value: '5:4'
                          description: ''
                        - label: '4:5'
                          value: '4:5'
                          description: ''
                        - label: '16:9'
                          value: '16:9'
                          description: ''
                        - label: '9:16'
                          value: '9:16'
                          description: ''
                        - label: '2:1'
                          value: '2:1'
                          description: ''
                        - label: '1:2'
                          value: '1:2'
                          description: ''
                        - label: '3:1'
                          value: '3:1'
                          description: ''
                        - label: '1:3'
                          value: '1:3'
                          description: ''
                        - label: '21:9'
                          value: '21:9'
                          description: ''
                        - value: '9:21'
                          name: ''
                          description: ''
                    resolution:
                      type: string
                      enum:
                        - 1K
                        - 2K
                        - 4K
                      x-apidog-enum:
                        - value: 1K
                          name: ''
                          description: ''
                        - value: 2K
                          name: ''
                          description: ''
                        - value: 4K
                          name: ''
                          description: ''
                      description: >-
                        Image resolution: Note: Images with a 1:1 aspect ratio
                        cannot be converted to 4K images. Images with the aspect
                        ratio set to "auto" or without a specified aspect ratio
                        parameter will only be converted to 1K images;
                        otherwise, the task will fail to create.
                    background:
                      type: string
                      description: >-
                        Image background

                        Note: This parameter is only supported when the
                        resolution is 1K.
                      enum:
                        - transparent
                        - opaque
                        - auto
                      x-apidog-enum:
                        - value: transparent
                          name: ''
                          description: Transparency
                        - value: opaque
                          name: ''
                          description: Opaque
                        - value: auto
                          name: ''
                          description: Automatically
                  x-apidog-orders:
                    - prompt
                    - aspect_ratio
                    - resolution
                    - background
                  x-apidog-ignore-properties: []
              x-apidog-orders:
                - model
                - callBackUrl
                - input
              x-apidog-ignore-properties: []
            example:
              model: gpt-image-2-text-to-image
              callBackUrl: https://your-domain.com/api/callback
              input:
                prompt: >-
                  A cinematic night city poster with neon reflections on a rainy
                  street.
                aspect_ratio: auto
      responses:
        '200':
          description: Request successful
          content:
            application/json:
              schema:
                allOf:
                  - type: object
                    properties:
                      code:
                        type: integer
                        description: >-
                          Response Status Codes


                          200: Success - The request was successfully processed.


                          401: Unauthorized - Insufficient or invalid
                          authentication credentials.


                          402: Insufficient Quota - The account has insufficient
                          quota to perform this operation.


                          404: Not Found - The requested resource or interface
                          does not exist.


                          422: Validation Error - The request parameters failed
                          the validation check.


                          429: Request Restricted - The request frequency limit
                          for this resource has been exceeded.


                          433: Request Limit - The subkey usage exceeded the
                          limit.


                          455: Service Unavailable - The system is currently
                          under maintenance.


                          500: Server Error - An unexpected error occurred while
                          processing the request.


                          501: Generation Failed - The content generation task
                          failed.


                          505: Feature Disabled - The requested feature is
                          currently disabled.
                        enum:
                          - 200
                          - 401
                          - 402
                          - 404
                          - 422
                          - 429
                          - 433
                          - 455
                          - 500
                          - 501
                          - 505
                      msg:
                        type: string
                        description: Response message, error description upon failure
                        examples:
                          - success
                      data:
                        type: object
                        required:
                          - taskId
                        properties:
                          taskId:
                            type: string
                            description: >-
                              The task ID can be used with the "Get Task
                              Details" endpoint to query the task status.
                            examples:
                              - dc1928bfcbc77cb6c85f3359a9c718b3
                        x-apidog-orders:
                          - taskId
                        x-apidog-ignore-properties: []
                    x-apidog-orders:
                      - 01KPR07RANE520VZS4M5X3TGNY
                    required:
                      - data
                    x-apidog-refs:
                      01KPR07RANE520VZS4M5X3TGNY:
                        $ref: '#/components/schemas/response%20not%20with%20recordId'
                    x-apidog-ignore-properties:
                      - code
                      - msg
                      - data
              example:
                code: 200
                msg: success
                data:
                  taskId: task_gptimage_1765180586443
          headers: {}
          x-apidog-name: ''
      security:
        - BearerAuth: []
          x-apidog:
            schemeGroups:
              - id: kn8M4YUlc5i0A0179ezwx
                schemeIds:
                  - BearerAuth
            required: true
            use:
              id: kn8M4YUlc5i0A0179ezwx
            scopes:
              kn8M4YUlc5i0A0179ezwx:
                BearerAuth: []
      callbacks:
        onImageGenerated:
          '{$request.body#/callBackUrl}':
            post:
              summary: Image Generation Callback
              description: >-
                When the image generation task is completed, the system sends
                the result to your callback URL via a POST request.
              requestBody:
                required: true
                content:
                  application/json:
                    schema:
                      type: object
                      properties:
                        code:
                          type: integer
                          description: >-
                            Status code


                            - **200**: Success - Image generation task completed
                            successfully

                            - **400**: Invalid request parameters or content
                            violates policy

                            - **500**: Internal error. Please try again later.

                            - **501**: Failed - Image generation task failed
                          enum:
                            - 200
                            - 400
                            - 500
                            - 501
                        msg:
                          type: string
                          description: Status message
                          example: Playground task completed successfully.
                        data:
                          type: object
                          properties:
                            completeTime:
                              type: integer
                              format: int64
                              description: >-
                                Task completion time, represented as a Unix
                                timestamp in milliseconds
                              example: 1786432830000
                            costTime:
                              type: integer
                              description: Task duration in seconds
                              example: 83
                            createTime:
                              type: integer
                              format: int64
                              description: >-
                                Task creation time, represented as a Unix
                                timestamp in milliseconds
                              example: 1786432746000
                            creditsConsumed:
                              type: number
                              format: double
                              description: Number of credits consumed by the task
                              example: 3
                            model:
                              type: string
                              description: Image generation model used for the task
                              example: gpt-image-2-text-to-image
                            param:
                              type: string
                              description: >-
                                Parameters submitted when creating the task, in
                                JSON string format
                              example: >-
                                {"input":"{\"aspect_ratio\":\"auto\",\"prompt\":\"A
                                cinematic night city poster with neon
                                reflections on a rainy
                                street.\"}","callBackUrl":"https://webhook.uutool.cn/5f723555-ec59-4b8f-8feb-bed810982785","model":"gpt-image-2-text-to-image"}
                            resultJson:
                              type: string
                              description: >-
                                Image generation result in JSON string format.
                                resultUrls contains the list of generated image
                                URLs.
                              example: >-
                                {"resultUrls":["https://tempfile.aiquickdraw.com/images/chatgpt/file_000000002b24820caef9f1684a4f4747.png"]}
                            state:
                              type: string
                              description: Task status
                              enum:
                                - success
                                - fail
                              example: success
                            taskId:
                              type: string
                              description: Task ID
                              example: ed578231bfed231f0884c564579a965d
                            updateTime:
                              type: integer
                              format: int64
                              description: >-
                                Last task update time, represented as a Unix
                                timestamp in milliseconds
                              example: 1786432830000
              responses:
                '200':
                  description: Callback received successfully
      x-apidog-folder: docs/en/Market/Image    Models/GPT Image
      x-apidog-status: released
      x-run-in-apidog: https://app.apidog.com/web/project/1184766/apis/api-33846334-run
components:
  schemas:
    response not with recordId:
      type: object
      required:
        - data
      properties:
        code:
          type: integer
          description: >-
            Response Status Codes


            200: Success - The request was successfully processed.


            401: Unauthorized - Insufficient or invalid authentication
            credentials.


            402: Insufficient Quota - The account has insufficient quota to
            perform this operation.


            404: Not Found - The requested resource or interface does not exist.


            422: Validation Error - The request parameters failed the validation
            check.


            429: Request Restricted - The request frequency limit for this
            resource has been exceeded.


            433: Request Limit - The subkey usage exceeded the limit.


            455: Service Unavailable - The system is currently under
            maintenance.


            500: Server Error - An unexpected error occurred while processing
            the request.


            501: Generation Failed - The content generation task failed.


            505: Feature Disabled - The requested feature is currently disabled.
          enum:
            - 200
            - 401
            - 402
            - 404
            - 422
            - 429
            - 433
            - 455
            - 500
            - 501
            - 505
        msg:
          type: string
          description: Response message, error description upon failure
          examples:
            - success
        data:
          type: object
          required:
            - taskId
          properties:
            taskId:
              type: string
              description: >-
                The task ID can be used with the "Get Task Details" endpoint to
                query the task status.
              examples:
                - dc1928bfcbc77cb6c85f3359a9c718b3
          x-apidog-orders:
            - taskId
          x-apidog-ignore-properties: []
      x-apidog-orders:
        - code
        - msg
        - data
      x-apidog-ignore-properties: []
      x-apidog-folder: ''
  securitySchemes:
    BearerAuth:
      type: bearer
      scheme: bearer
      bearerFormat: API Key
      description: >-
        All API requests require a Bearer Token. Add the header `Authorization:
        Bearer YOUR_API_KEY` to authenticate requests.
    BearerAuth1:
      type: bearer
      scheme: bearer
      bearerFormat: API Key
      description: >-
        所有 API 请求都需要 Bearer Token。请在请求头中添加 `Authorization: Bearer YOUR_API_KEY`
        进行身份验证。
servers:
  - url: https://api.kie.ai
    description: 正式环境
security:
  - BearerAuth: []
    x-apidog:
      schemeGroups:
        - id: kn8M4YUlc5i0A0179ezwx
          schemeIds:
            - BearerAuth
      required: true
      use:
        id: kn8M4YUlc5i0A0179ezwx
      scopes:
        kn8M4YUlc5i0A0179ezwx:
          BearerAuth: []

```