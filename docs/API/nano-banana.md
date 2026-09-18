# Google - Nano Banana 2

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
      summary: Google - Nano Banana 2
      deprecated: false
      description: >
        Image generation by Nano Banana 2


        ## Query Task Status


        After submitting a task, use the unified query endpoint to check
        progress and retrieve results:


        <Card title="Get Task Details" icon="lucide-search"
        href="/market/common/get-task-detail">
          Learn how to query task status and retrieve generation results
        </Card>



        ::: tip[]

        For production use, we recommend using the `callBackUrl` parameter to
        receive automatic notifications when generation completes, rather than
        polling the status endpoint.

        :::



        ## Related Resources


        <CardGroup cols={2}>
          <Card title="Market Overview" icon="lucide-store" href="/market/quickstart">
            Explore all available models
          </Card>
          <Card title="Common API" icon="lucide-cog" href="/common-api/get-account-credits">
            Check credits and account usage
          </Card>
        </CardGroup>
      tags:
        - docs/en/Market/Image    Models/Google
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
                  enum:
                    - nano-banana-2
                  default: nano-banana-2
                  description: |-
                    The model name to use for generation. Required field.

                    - Must be `nano-banana-2` for this endpoint
                  examples:
                    - nano-banana-2
                callBackUrl:
                  type: string
                  format: uri
                  description: >-
                    The URL to receive generation task completion updates.
                    Optional but recommended for production use.


                    - System will POST task status and results to this URL when
                    generation completes

                    - Callback includes generated content URLs and task
                    information

                    - Your callback endpoint should accept POST requests with
                    JSON payload containing results

                    - Alternatively, use the Get Task Details endpoint to poll
                    task status

                    - To ensure callback security, see [Webhook Verification
                    Guide](/common-api/webhook-verification) for signature
                    verification implementation
                  examples:
                    - https://your-domain.com/api/callback
                input:
                  type: object
                  description: Input parameters for the generation task
                  properties:
                    prompt:
                      type: string
                      description: >-
                        A text description of the image you want to generate
                        (Max length: 20000 characters)
                      maxLength: 20000
                      examples:
                        - >-
                          Comic poster: cool banana hero in shades leaps from
                          sci-fi pad. Six panels: 1) 4K mountain landscape, 2)
                          banana holds page of long multilingual text with auto
                          translation, 3) Gemini 3 hologram for
                          search/knowledge/reasoning, 4) camera UI sliders for
                          angle focus color, 5) frame trio 1:1-9:16, 6)
                          consistent banana poses. Footer shows Google icons.
                          Tagline: Nano Banana Pro now on Kie AI.
                    image_input:
                      description: >-
                        Input images to transform or use as reference (supports
                        up to 14 images) (File URL after upload, not file
                        content; Accepted types: image/jpeg, image/png,
                        image/webp; Max size: 30.0MB)
                      type: array
                      items:
                        type: string
                        format: uri
                      maxItems: 14
                      examples:
                        - []
                    aspect_ratio:
                      type: string
                      description: Aspect ratio of the generated image
                      enum:
                        - '1:1'
                        - '2:3'
                        - '3:2'
                        - '1:4'
                        - '4:1'
                        - '3:4'
                        - '4:3'
                        - '4:5'
                        - '5:4'
                        - '1:8'
                        - '8:1'
                        - '9:16'
                        - '16:9'
                        - '21:9'
                        - auto
                      default: auto
                      examples:
                        - '1:1'
                      x-apidog-enum:
                        - value: '1:1'
                          name: ''
                          description: ''
                        - value: '2:3'
                          name: ''
                          description: ''
                        - value: '3:2'
                          name: ''
                          description: ''
                        - value: '1:4'
                          name: ''
                          description: ''
                        - value: '4:1'
                          name: ''
                          description: ''
                        - value: '3:4'
                          name: ''
                          description: ''
                        - value: '4:3'
                          name: ''
                          description: ''
                        - value: '4:5'
                          name: ''
                          description: ''
                        - value: '5:4'
                          name: ''
                          description: ''
                        - value: '1:8'
                          name: ''
                          description: ''
                        - value: '8:1'
                          name: ''
                          description: ''
                        - value: '9:16'
                          name: ''
                          description: ''
                        - value: '16:9'
                          name: ''
                          description: ''
                        - value: '21:9'
                          name: ''
                          description: ''
                        - value: auto
                          name: ''
                          description: ''
                    resolution:
                      description: Resolution of the generated image
                      type: string
                      enum:
                        - 1K
                        - 2K
                        - 4K
                      default: 1K
                      examples:
                        - 1K
                    output_format:
                      description: Format of the output image
                      type: string
                      enum:
                        - png
                        - jpg
                      default: jpg
                      examples:
                        - jpg
                  required:
                    - prompt
                  x-apidog-orders:
                    - prompt
                    - image_input
                    - aspect_ratio
                    - resolution
                    - output_format
                  x-apidog-ignore-properties: []
              x-apidog-orders:
                - model
                - callBackUrl
                - input
              x-apidog-ignore-properties: []
            example:
              model: nano-banana-2
              callBackUrl: https://your-domain.com/api/callback
              input:
                prompt: >-
                  Comic poster: cool banana hero in shades leaps from sci-fi
                  pad. Six panels: 1) 4K mountain landscape, 2) banana holds
                  page of long multilingual text with auto translation, 3)
                  Gemini 3 hologram for search/knowledge/reasoning, 4) camera UI
                  sliders for angle focus color, 5) frame trio 1:1-9:16, 6)
                  consistent banana poses. Footer shows Google icons. Tagline:
                  Nano Banana Pro now on Kie AI.
                image_input: []
                aspect_ratio: auto
                resolution: 1K
                output_format: png
      responses:
        '200':
          description: ''
          content:
            application/json:
              schema:
                type: object
                properties:
                  code:
                    type: integer
                    description: >-
                      Response Status Codes


                      200: Success - The request was successfully processed.


                      401: Unauthorized - Insufficient or invalid authentication
                      credentials.


                      402: Insufficient Quota - The account has insufficient
                      quota to perform this operation.


                      404: Not Found - The requested resource or interface does
                      not exist.


                      422: Validation Error - The request parameters failed the
                      validation check.


                      429: Request Restricted - The request frequency limit for
                      this resource has been exceeded.


                      433: Request Limit - The subkey usage exceeded the limit.


                      455: Service Unavailable - The system is currently under
                      maintenance.


                      500: Server Error - An unexpected error occurred while
                      processing the request.


                      501: Generation Failed - The content generation task
                      failed.


                      505: Feature Disabled - The requested feature is currently
                      disabled.
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
                          The task ID can be used with the "Get Task Details"
                          endpoint to query the task status.
                        examples:
                          - dc1928bfcbc77cb6c85f3359a9c718b3
                    x-apidog-orders:
                      - taskId
                    x-apidog-ignore-properties: []
                x-apidog-orders:
                  - 01KPA2X6SD673XG6BGZ9JH4KEH
                required:
                  - data
                x-apidog-refs:
                  01KPA2X6SD673XG6BGZ9JH4KEH:
                    $ref: '#/components/schemas/response%20not%20with%20recordId'
                x-apidog-ignore-properties:
                  - code
                  - msg
                  - data
          headers: {}
          x-apidog-name: 成功
        '500':
          description: request failed
          content:
            application/json:
              schema:
                type: object
                properties:
                  code:
                    type: integer
                    description: >-
                      Response status code


                      - **200**: Success - Request has been processed
                      successfully

                      - **401**: Unauthorized - Authentication credentials are
                      missing or invalid

                      - **402**: Insufficient Credits - Account does not have
                      enough credits to perform the operation

                      - **404**: Not Found - The requested resource or endpoint
                      does not exist

                      - **408**: Upstream is currently experiencing service
                      issues. No result has been returned for over 10 minutes.

                      - **422**: Validation Error - The request parameters
                      failed validation checks

                      - **429**: Rate Limited - Request limit has been exceeded
                      for this resource

                      - **455**: Service Unavailable - System is currently
                      undergoing maintenance

                      - **500**: Server Error - An unexpected error occurred
                      while processing the request

                      - **501**: Generation Failed - Content generation task
                      failed

                      - **505**: Feature Disabled - The requested feature is
                      currently disabled
                  msg:
                    type: string
                    description: Response message, error description when failed
                  data:
                    type: object
                    properties: {}
                    x-apidog-orders: []
                    x-apidog-ignore-properties: []
                x-apidog-orders:
                  - code
                  - msg
                  - data
                required:
                  - code
                  - msg
                  - data
                x-apidog-ignore-properties: []
              example:
                code: 500
                msg: >-
                  Server Error - An unexpected error occurred while processing
                  the request
                data: null
          headers: {}
          x-apidog-name: 'Error '
      security:
        - BearerAuth: []
          x-apidog:
            required: true
            schemeGroups:
              - id: _K68pFi7DJw9f1w8M0nIP
                schemeIds:
                  - BearerAuth
            use:
              id: _K68pFi7DJw9f1w8M0nIP
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
                              example: 1786427040000
                            costTime:
                              type: integer
                              description: Task duration in seconds
                              example: 48
                            createTime:
                              type: integer
                              format: int64
                              description: >-
                                Task creation time, represented as a Unix
                                timestamp in milliseconds
                              example: 1786426989000
                            creditsConsumed:
                              type: number
                              format: double
                              description: Number of credits consumed by the task
                              example: 8
                            model:
                              type: string
                              description: Image generation model used for the task
                              example: nano-banana-2
                            param:
                              type: string
                              description: >-
                                Parameters submitted when creating the task, in
                                JSON string format
                              example: >-
                                {"input":"{\"image_input\":[],\"aspect_ratio\":\"auto\",\"output_format\":\"jpg\",\"prompt\":\"A
                                highly detailed illustration of a futuristic
                                banana-shaped spaceship flying above a neon city
                                at night, with realistic lighting, cinematic
                                effects, and 4K
                                quality.\",\"resolution\":\"2K\"}","callBackUrl":"https://webhook.uutool.cn/5f723555-ec59-4b8f-8feb-bed810982785","model":"nano-banana-2"}
                            resultJson:
                              type: string
                              description: >-
                                Image generation result in JSON string format.
                                resultUrls contains the list of generated image
                                URLs.
                              example: >-
                                {"resultUrls":["https://tempfile.aiquickdraw.com/workers/images/image_90b6bf4499a80b74a2b5ee640b7aaf70.jpg"]}
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
                              example: 4e029a320e97cff234e6e06827c3965e
                            updateTime:
                              type: integer
                              format: int64
                              description: >-
                                Last task update time, represented as a Unix
                                timestamp in milliseconds
                              example: 1786427040000
              responses:
                '200':
                  description: Callback received successfully
      x-apidog-folder: docs/en/Market/Image    Models/Google
      x-apidog-status: released
      x-run-in-apidog: https://app.apidog.com/web/project/1184766/apis/api-28711567-run
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