-- FINIX cbs_srvc.json export
-- Save result as backend/cbs_srvc.json
--
-- 현재 쓰시는 쿼리와의 차이:
-- 1) input_fields + output_fields 둘 다 포함 (지금은 input만 있음)
-- 2) In/Out DTO 속성만 조인 — nested SubOut 클래스 필드는 여기에 없음
--    → nested 리스트 leaf는 scripts/export_cbs_dto_atr.sql 로 별도 덤프
--
-- MySQL 8+ / MariaDB. INST_CD·SRVC_STS_CD 는 환경에 맞게 조정.

SELECT
    s.SRVC_CD AS service_code,
    CASE SUBSTRING(s.SRVC_CD, 1, 2)
        WHEN 'AC' THEN 'ACCOUNTING'
        WHEN 'AM' THEN 'ASSESSMENT'
        WHEN 'AR' THEN 'ARRANGEMENT'
        WHEN 'AS' THEN 'ASSET'
        WHEN 'AT' THEN 'ACTOR'
        WHEN 'BP' THEN 'PARTNER'
        WHEN 'CL' THEN 'COLLATERAL'
        WHEN 'CM' THEN 'COMMON'
        WHEN 'CR' THEN 'CALCULATOR'
        WHEN 'CU' THEN 'CUSTOMER'
        WHEN 'DC' THEN 'DOCUMENT'
        WHEN 'DP' THEN 'DEPOSIT'
        WHEN 'DT' THEN 'DEPARTMENT'
        WHEN 'FX' THEN 'FOREIGNEXCHANGE'
        WHEN 'IA' THEN 'INTERNALACCOUNT'
        WHEN 'LM' THEN 'LIMIT'
        WHEN 'LN' THEN 'LOAN'
        WHEN 'PD' THEN 'PRODUCT'
        WHEN 'PY' THEN 'PAYMENT'
        WHEN 'SF' THEN 'STAFF'
        WHEN 'ST' THEN 'SETTLEMENT'
        WHEN 'SV' THEN 'SERVICEMANAGEMENT'
        WHEN 'TR' THEN 'TREASURY'
        WHEN 'UE' THEN 'UNDEREXAMINATION'
        WHEN 'XP' THEN 'EXTERNALPROXY'
        ELSE 'UNKNOWN'
    END AS business_domain,
    s.SRVC_NM AS service_name,
    s.CMPNT_CD AS component_code,
    s.OPRTN_NM AS operation_name,
    s.HTTP_METHOD_NM AS http_method,
    s.SRVC_URI_CNTNT AS endpoint_uri,
    s.IN_DTO_NM AS input_dto_name,
    s.OUT_DTO_NM AS output_dto_name,
    in_fields.input_fields,
    out_fields.output_fields
FROM rd_app_srvc_m s
LEFT JOIN (
    SELECT
        CLASS_NM,
        INST_CD,
        JSON_ARRAYAGG(
            JSON_OBJECT(
                'field_name', ATR_NM,
                'nested_dto_class_name', SUB_DTO_CLASS_NM,
                'list_flag', LIST_DTO_YN,
                'required_flag', MNDTRY_YN,
                'required_status',
                    CASE
                        WHEN MNDTRY_YN = 'Y' THEN 'required'
                        ELSE 'optional'
                    END,
                'validation_rule', ATR_VLDTN_RULE_CNTNT,
                'validation_method_code', ATR_VLDTN_WAY_CD,
                'dto_status_code', DTO_STS_CD
            )
        ) AS input_fields
    FROM rd_app_dto_class_atr_d
    GROUP BY CLASS_NM, INST_CD
) in_fields
    ON s.IN_DTO_NM = in_fields.CLASS_NM
   AND s.INST_CD = in_fields.INST_CD
LEFT JOIN (
    SELECT
        CLASS_NM,
        INST_CD,
        JSON_ARRAYAGG(
            JSON_OBJECT(
                'field_name', ATR_NM,
                'nested_dto_class_name', SUB_DTO_CLASS_NM,
                'list_flag', LIST_DTO_YN,
                'required_flag', MNDTRY_YN,
                'required_status',
                    CASE
                        WHEN MNDTRY_YN = 'Y' THEN 'required'
                        ELSE 'optional'
                    END,
                'validation_rule', ATR_VLDTN_RULE_CNTNT,
                'validation_method_code', ATR_VLDTN_WAY_CD,
                'dto_status_code', DTO_STS_CD
            )
        ) AS output_fields
    FROM rd_app_dto_class_atr_d
    GROUP BY CLASS_NM, INST_CD
) out_fields
    ON s.OUT_DTO_NM = out_fields.CLASS_NM
   AND s.INST_CD = out_fields.INST_CD
WHERE s.INST_CD = '1001'
  AND s.SRVC_STS_CD = '01'
ORDER BY service_code;
