#!/usr/bin/python
import os
import sys
import pandas as pd
import pickle

import time
import logging
import numpy 

from sklearn.model_selection import train_test_split
from metrics import Metrics
from datetime import datetime

from config import Config
import traceback

import warnings
warnings.filterwarnings('ignore')

class Train:
	"""
	This is the train phase of the model we are implementing
	Arguments:
		:param arg1:filename
		:param arg2:input column number
		:param arg3:target column number
		:param arg4:model name
		:type arg1:str
		:type arg2:int
		:type arg3:int
		:type arg4:str
		:returns:pickle file
		:rtype:.pkl

	"""


	def __init__(self,header_id,training_id,csv_file_name,input_col,target_col,model_name,actual_model_name):
		self.header_id = header_id
		self.training_id = training_id
		self.csv_file_name = csv_file_name
		self.input_col = input_col
		self.target_col = target_col
		self.model_name = model_name
		self.actual_model_name = actual_model_name
		self.get_params()


	def get_params(self):
		df=pd.read_csv(self.csv_file_name)
		df.fillna(0, inplace=True) 
		inputParams = [df.columns.get_loc(c) for c in self.input_col if c in df]
		targetParams = [df.columns.get_loc(c) for c in self.target_col if c in df]
		X=df.iloc[:,inputParams].values
		y=df.iloc[:,targetParams].values
		self.train(X,y)

	def train(self,X,y):
		try:
			x_train,x_test,y_train,y_test=train_test_split(X,y,test_size=0.2)
			self.model_name.fit(x_train, y_train)
			self.trained_data = {'data': self.model_name}
			#getting filename
			filename_w_ext = os.path.basename(self.csv_file_name)
			filename , ext = os.path.splitext(filename_w_ext)

			#getting timestamp
			timestampStr = time.strftime("%Y%m%d-%H%M%S")
			self.get_metrics(x_test,y_test,filename,timestampStr)
			self.pickle_file(filename,timestampStr)
		except ValueError as ve:
			print("ValueError in input parameters while model fitting in training",ve)
			traceback.print_exc()


	def get_metrics(self,x_test,y_test,filename,timestampStr):
		y_pred_test = self.model_name.predict(x_test)
		fileCode = 'TRAIN'
		Metrics(self.header_id,self.training_id,y_test,y_pred_test,self.model_name,self.actual_model_name,filename,timestampStr,fileCode)


	def pickle_file(self,filename,timestampStr): 
		"""
			The pickle file with latest timestamp is retrieved 
			The file path of downloads location is retrieved 
			Pickle file is dumped into the downloads folder 
		"""
		pickleFileName = filename+'.pkl'
		pickleFileName = os.path.join(Config.PICKLE_FOLDER, pickleFileName)
		startTime = time.time()
		try:
			pickle.dump(self.model_name,open(pickleFileName, 'wb'))
			print("Succesful pickling")
		#print('time taken : - ',time.time() - startTime)
		except Exception as e:
			print("Error: ", e.__str__())
		except IOError as ioe:
			print(ioe)
		except OSError as ose:
			print(ose)
		except FileNotFoundError as fne:
			print(fne)
		except pickle.PickleError as e:
			print("Not succesful", e)
			print('**********************')
			traceback.print_exc()
			print('**********************')
