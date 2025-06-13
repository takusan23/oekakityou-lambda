# お絵かき帳 Lambda
画像配信サーバー（超簡易的）お絵かき帳。  
`S3`のバケットをトリガーに`Lambda`で`ImageMagick`を動かし画像を小さくし、配信用`S3`バケットに放り込む。

# 仕様
## 構成図
// todo

## URL
画像をアップロードすると`UUID`が払い出され、できる限りそのままの画像と、配信用に半分くらいにした画像が`S3`のバケットに保存されます。  
おなじ`UUID`になる。

- /original/{UUID}.{拡張子}
    - 投稿した動画をできる限りそのままの画質で保存します
    - 基本的には小さくした画像を使うので、使いません、、
- /resize/{UUID}.{拡張子}
    - ziyuutyou ブログに貼る用

# 更新手順
すいません、`Windows`しか動きません。。。

- `npm run build`を叩く
- `dist.zip`を`Lambda`へデプロイする
- 変換した画像の保存先`S3 Bucket`の名前を環境変数に追加する
    - `S3_RESULT_BACKET_NAME`で

# 本番デプロイ手順
`Ultra HDR`対応`ImageMagick`のビルドから...

https://takusan.negitoro.dev/posts/oekakityou_aws_s3_lambda_imagemagick_image_resize/
